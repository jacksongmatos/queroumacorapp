// app/api/whatsapp/send/route.ts — envio de mensagem via WhatsApp Cloud API.
//
// Quem pode chamar: SÓ admin (mesmo gate do /api/admin/users — token
// Supabase válido + email em ADMIN_EMAILS). Uso previsto: portal da loja
// avisando cliente/pintor (pedido pronto, orçamento, camiseta) pelo número
// oficial +55 11 95976-5031.
//
// Payload: { to, type?: 'text'|'template', body?, template?, languageCode?,
// components?, accessToken? } — ver lib/api/schemas/whatsapp-send.ts.
//
// Lembrete da janela de 24h da Meta: texto livre só entrega pra quem falou
// com o número nas últimas 24h; fora disso o Graph devolve 131047 e o
// service traduz pra 422 "use um template aprovado".

import { type NextRequest } from 'next/server';
import {
  checkRateLimit,
  getToken,
  isAdminEmail,
  jsonResponse,
  rateLimitResponse,
  readBody,
  ServiceError,
  serviceErrorResponse,
} from '@/lib/api/security';
import { verifyAdminToken } from '@/lib/api/_services/_admin-helpers';
import {
  isWhatsAppConfigured,
  normalizeBrPhone,
  persistWhatsAppMessage,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  type TemplateComponent,
} from '@/lib/api/_services/whatsapp';
import {
  isEvolutionConfigured,
  normalizeWhatsAppTarget,
  sendEvolutionText,
} from '@/lib/api/_services/whatsapp-evo';
import { whatsappSendSchema } from '@/lib/api/schemas/whatsapp-send';
import { logAuditEvent } from '@/lib/api/audit';

export const runtime = 'edge';

// ORÇAMENTO TOTAL da rota. Cada hop já tinha o seu timeout (auth 10s, rate
// limit 10s, envio, gravação 8s, audit 5s), mas ninguém somava: bastava um
// hop lento pra passar da linha em que o Cloudflare mata a function do edge,
// e aí quem chega na tela é a página "502 Bad gateway" do PRÓPRIO CF — HTML
// cru, sem dizer nada — em vez do nosso JSON. Foi o que voltou em
// 2026-08-31 na abordagem de lead. Este teto garante que a resposta é
// SEMPRE nossa: se o trabalho não terminou, respondemos 500 explicando
// (500 e não 504 — ver deadlineResponse).
const ROUTE_DEADLINE_MS = 22000;

// Teto do que roda DEPOIS do envio (gravar a mensagem + audit). Passou
// disso, a resposta sai assim mesmo: o cliente já recebeu a mensagem, e
// segurar a tela do operador por causa de escrituração é o que criava o
// 502 em envio que deu certo.
const BOOKKEEPING_BUDGET_MS = 6000;

/**
 * Resposta honesta quando o orçamento acaba: a mensagem PODE ter saído.
 *
 * 500, não 504: o Cloudflare substitui o corpo de 502/504 pela página de
 * erro DELE, e este texto — que é a única coisa que diz ao operador pra
 * conferir a conversa antes de reenviar — nunca chegaria na tela. Era o
 * mesmo problema que a página "502 Bad gateway" já tinha criado aqui.
 */
function deadlineResponse() {
  return jsonResponse(
    {
      error:
        'o envio passou de 22s e foi interrompido pra não morrer no gateway. A mensagem PODE ter saído — confira a conversa em /admin/whatsapp antes de mandar de novo.',
    },
    500
  );
}

export async function POST(request: NextRequest) {
  const deadline = new Promise<Response>((resolve) =>
    setTimeout(() => resolve(deadlineResponse()), ROUTE_DEADLINE_MS)
  );
  return Promise.race([handle(request), deadline]);
}

async function handle(request: NextRequest): Promise<Response> {
  // Canal preferido pra TEXTO: Evolution API (número secundário, sem janela
  // de 24h) enquanto a Cloud API da Meta não autentica (2026-08-28).
  // Templates seguem exclusivos da Meta. Basta UM dos dois configurado.
  if (!isWhatsAppConfigured() && !isEvolutionConfigured()) {
    return jsonResponse(
      {
        error:
          'Nenhum canal de WhatsApp configurado (DUALHOOK_API_KEY ou EVOLUTION_API_URL/EVOLUTION_API_KEY)',
      },
      503
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await readBody(request, { maxBytes: 256 * 1024 })) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  try {
    const token = getToken(request, body);
    const { callerId, email } = await verifyAdminToken(token);
    if (!callerId) throw new ServiceError('token inválido', 401);
    if (!isAdminEmail(email)) throw new ServiceError('não autorizado (email não admin)', 403);

    const rl = await checkRateLimit({
      userId: callerId || email,
      endpoint: 'whatsapp-send',
      limit: 30,
    });
    if (!rl.allowed) return rateLimitResponse(rl);

    const parsed = whatsappSendSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: 'payload inválido', issues: parsed.error.issues },
        400
      );
    }
    const input = parsed.data;

    let result: { messageId: string; waId: string };
    let channel: 'evolution' | 'meta';
    if (input.type === 'template') {
      // Template é recurso da Meta — não existe na Evolution.
      if (!isWhatsAppConfigured()) {
        throw new ServiceError(
          'templates exigem a Cloud API da Meta, que ainda não está configurada — envie como texto',
          503
        );
      }
      channel = 'meta';
      result = await sendWhatsAppTemplate({
        to: input.to,
        template: input.template as string,
        languageCode: input.languageCode,
        components: input.components as TemplateComponent[] | undefined,
      });
    } else if (isEvolutionConfigured()) {
      channel = 'evolution';
      result = await sendEvolutionText({ to: input.to, body: input.body as string });
    } else {
      channel = 'meta';
      result = await sendWhatsAppText({ to: input.to, body: input.body as string });
    }

    // SQL Wave 38: histórico da conversa em `whatsapp_messages` + trilha no
    // audit_log. Os dois são best-effort — a mensagem JÁ SAIU, escrituração
    // não pode custar o sucesso da resposta. "Não pode custar" agora é
    // código e não só comentário: em série e sem teto, eles somavam até 13s
    // DEPOIS do envio dentro do mesmo orçamento do edge, e era assim que um
    // envio bem-sucedido ainda terminava na página 502 do Cloudflare — com
    // a mensagem já entregue ao cliente e o operador achando que falhou.
    // Agora correm em paralelo e com teto próprio.
    const bookkeeping = Promise.allSettled([
      persistWhatsAppMessage({
        direction: 'out',
        // Fallback do wa_id respeita DDI estrangeiro (ver
        // normalizeWhatsAppTarget) — com normalizeBrPhone, resposta pra
        // número dos EUA era gravada na conversa errada.
        waId:
          result.waId ||
          (channel === 'evolution'
            ? normalizeWhatsAppTarget(input.to)
            : normalizeBrPhone(input.to)) ||
          input.to,
        messageId: result.messageId,
        type: input.type,
        body: input.body,
        template: input.template,
        sentBy: callerId,
        origin: 'portal',
      }),
      // Sem o corpo completo no `changes` — só o preview — pra não acumular
      // conversa de cliente no audit_log (LGPD data minimization).
      logAuditEvent({
        actorId: callerId,
        action: 'whatsapp.send',
        targetTable: null,
        targetId: result.waId || null,
        changes: {
          type: input.type,
          channel,
          template: input.template || null,
          bodyPreview: (input.body || '').slice(0, 80),
          messageId: result.messageId,
        },
        request,
      }),
    ]);
    await Promise.race([
      bookkeeping,
      new Promise((r) => setTimeout(r, BOOKKEEPING_BUDGET_MS)),
    ]);

    return jsonResponse({
      ok: true,
      messageId: result.messageId,
      waId: result.waId,
      channel,
    });
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    console.error('whatsapp-send erro inesperado:', e instanceof Error ? e.message : e);
    return jsonResponse({ error: 'erro interno' }, 500);
  }
}
