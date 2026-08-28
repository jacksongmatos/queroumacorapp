// app/api/whatsapp-evo/webhook/route.ts — recebe eventos do Evolution API
// (WhatsApp via Baileys no Render) e grava as mensagens em
// `whatsapp_messages` (mesma tabela/tela do canal Meta — /admin/whatsapp).
//
// Autenticação: a Evolution NÃO assina eventos (sem HMAC tipo Meta), então o
// segredo vai na PRÓPRIA URL configurada no Manager:
//   https://www.queroumacor.com.br/api/whatsapp-evo/webhook?token=<EVOLUTION_WEBHOOK_TOKEN>
// Token errado/ausente → 401 e nada é processado.
//
// Depois de autenticado, SEMPRE 200 (anti retry-storm, igual mp-webhook e
// whatsapp/webhook): falha de persistência não pode fazer a Evolution
// re-entregar em loop — persistWhatsAppMessage já é best-effort e o
// message_id UNIQUE deduplica retries.
//
// Configurar no Manager: instância `meu-whatsapp` → Configurations →
// Webhook → URL acima, evento MESSAGES_UPSERT habilitado.

import { type NextRequest } from 'next/server';
import { getRuntimeEnv } from '@/lib/api/env';
import { jsonResponse, readBody, ServiceError, serviceErrorResponse } from '@/lib/api/security';
import { persistWhatsAppMessage } from '@/lib/api/_services/whatsapp';
import { parseEvolutionWebhook } from '@/lib/api/_services/whatsapp-evo';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const expected = getRuntimeEnv('EVOLUTION_WEBHOOK_TOKEN') || '';
  if (!expected) {
    return jsonResponse(
      { error: 'webhook não configurado (EVOLUTION_WEBHOOK_TOKEN ausente)' },
      503
    );
  }
  const provided = request.nextUrl.searchParams.get('token') || '';
  if (provided !== expected) {
    return jsonResponse({ error: 'token inválido' }, 401);
  }

  let payload: unknown;
  try {
    payload = await readBody(request, { maxBytes: 1024 * 1024 });
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    // Corpo não-JSON: 200 mesmo assim — não vale retry.
    return jsonResponse({ ok: true, ignored: 'corpo inválido' });
  }

  try {
    const messages = parseEvolutionWebhook(payload);
    let persisted = 0;
    for (const msg of messages) {
      const ok = await persistWhatsAppMessage({
        direction: msg.direction,
        waId: msg.waId,
        profileName: msg.profileName,
        messageId: msg.messageId,
        type: msg.type,
        body: msg.text,
        waTimestamp: msg.timestamp,
      });
      if (ok) persisted++;
    }
    return jsonResponse({ ok: true, received: messages.length, persisted });
  } catch (e) {
    // Nunca 5xx pós-token: loga e devolve 200 pra Evolution não re-entregar.
    console.warn('whatsapp-evo webhook erro:', e instanceof Error ? e.message : e);
    return jsonResponse({ ok: true, error: 'processamento falhou (logado)' });
  }
}
