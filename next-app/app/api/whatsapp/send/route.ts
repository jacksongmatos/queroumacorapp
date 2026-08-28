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
import { whatsappSendSchema } from '@/lib/api/schemas/whatsapp-send';
import { logAuditEvent } from '@/lib/api/audit';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  if (!isWhatsAppConfigured()) {
    return jsonResponse(
      { error: 'WhatsApp Cloud API não configurada (WHATSAPP_ACCESS_TOKEN ausente)' },
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

    const result =
      input.type === 'template'
        ? await sendWhatsAppTemplate({
            to: input.to,
            template: input.template as string,
            languageCode: input.languageCode,
            components: input.components as TemplateComponent[] | undefined,
          })
        : await sendWhatsAppText({ to: input.to, body: input.body as string });

    // SQL Wave 38: histórico da conversa em `whatsapp_messages` (best-effort
    // — mensagem já saiu, gravar não pode custar o sucesso da resposta).
    await persistWhatsAppMessage({
      direction: 'out',
      waId: result.waId || normalizeBrPhone(input.to) || input.to,
      messageId: result.messageId,
      type: input.type,
      body: input.body,
      template: input.template,
      sentBy: callerId,
    });

    // Trilha: quem mandou o quê pra quem, pelo número oficial. Fail-open
    // (perder o log não pode custar a mensagem já enviada). Sem o corpo
    // completo no `changes` — só o preview — pra não acumular conversa de
    // cliente no audit_log (LGPD data minimization).
    await logAuditEvent({
      actorId: callerId,
      action: 'whatsapp.send',
      targetTable: null,
      targetId: result.waId || null,
      changes: {
        type: input.type,
        template: input.template || null,
        bodyPreview: (input.body || '').slice(0, 80),
        messageId: result.messageId,
      },
      request,
    }).catch(() => {});

    return jsonResponse({ ok: true, messageId: result.messageId, waId: result.waId });
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    console.error('whatsapp-send erro inesperado:', e instanceof Error ? e.message : e);
    return jsonResponse({ error: 'erro interno' }, 500);
  }
}
