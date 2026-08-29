// app/api/whatsapp-evo/followup/route.ts — dispara a VARREDURA DE
// FOLLOW-UP (ver lib/api/_services/whatsapp-followup.ts).
//
// Dois chamadores, duas autenticações:
//
//   1. pg_cron do Supabase, de hora em hora, via pg_net:
//        POST /api/whatsapp-evo/followup?token=<EVOLUTION_WEBHOOK_TOKEN>
//      Mesmo segredo do webhook (a Evolution também não assina nada) —
//      um env a menos pra configurar no Cloudflare.
//
//   2. O portal, no botão "🔁 Follow-up agora", com o token do admin no
//      corpo. Aceita `dryRun` pra ver o que ACONTECERIA sem enviar nada.
//
// Sempre 200 pro cron (o resultado vem no corpo): erro aqui não pode
// virar retry em cascata no banco.

import { type NextRequest } from 'next/server';
import { getRuntimeEnv } from '@/lib/api/env';
import {
  getToken,
  isAdminEmail,
  jsonResponse,
  readBody,
  ServiceError,
  serviceErrorResponse,
} from '@/lib/api/security';
import { verifyAdminToken } from '@/lib/api/_services/_admin-helpers';
import { runFollowupSweep } from '@/lib/api/_services/whatsapp-followup';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  let body: { accessToken?: unknown; dryRun?: unknown } = {};
  try {
    body = ((await readBody(request, { maxBytes: 8 * 1024 })) || {}) as typeof body;
  } catch {
    body = {}; // cron manda corpo vazio
  }

  // Caminho 1: segredo na URL (cron do banco).
  const expected = getRuntimeEnv('EVOLUTION_WEBHOOK_TOKEN') || '';
  const provided = request.nextUrl.searchParams.get('token') || '';
  const viaToken = Boolean(expected) && provided === expected;

  if (!viaToken) {
    // Caminho 2: admin do portal.
    try {
      const token = getToken(request, body);
      const { callerId, email } = await verifyAdminToken(token);
      if (!callerId) throw new ServiceError('token inválido', 401);
      if (!isAdminEmail(email)) throw new ServiceError('não autorizado (email não admin)', 403);
    } catch (e) {
      if (e instanceof ServiceError) return serviceErrorResponse(e);
      return jsonResponse({ error: 'não autorizado' }, 401);
    }
  }

  const result = await runFollowupSweep({ dryRun: body?.dryRun === true });
  return jsonResponse(result);
}
