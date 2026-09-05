// app/api/whatsapp/webhook/route.ts — webhook do WhatsApp Cloud API (Meta).
//
// GET  = verificação de assinatura do webhook (painel da Meta ou Dualhook):
//        confere `hub.verify_token` contra WHATSAPP_WEBHOOK_VERIFY_TOKEN e
//        devolve `hub.challenge` em texto puro.
// POST = eventos (mensagens recebidas + status de entrega). Autenticação
//        conforme WHATSAPP_WEBHOOK_AUTH_MODE:
//        - `payload` (default; Dualhook): exige o segredo de URL
//          (`?token=` = WHATSAPP_WEBHOOK_URL_SECRET, no GET e no POST) E
//          valida o FORMATO do envelope — WABA e phone_number_id têm que
//          ser os nossos. O header `X-Hub-Signature-256` vem assinado pelo
//          app do Dualhook e não é verificável por nós (ver comentário em
//          _services/whatsapp.ts). Só o payload não basta: os IDs são
//          públicos, o segredo de URL é o que autentica o remetente.
//        - `hmac` (app Meta próprio, sem Dualhook): HMAC-SHA256 do
//          META_APP_SECRET sobre o RAW body, validado ANTES do parse.
//
// Anti-retry-storm (mesma filosofia do mp-webhook): depois de autenticado,
// SEMPRE 200 — falha nossa de processamento não pode fazer a Meta
// martelar (ela desativa webhook com muitas falhas). 401 só pra
// autenticação inválida; 503 só pra config ausente.
//
// Por enquanto o POST só reconhece, loga e persiste (console → Cloudflare
// logs; tabela `whatsapp_messages`). Responder automático é etapa futura.

import { type NextRequest, NextResponse } from 'next/server';
import { getRuntimeEnv } from '@/lib/api/env';
import {
  checkWebhookUrlSecret,
  getPhoneNumberId,
  getWabaId,
  getWebhookAuthMode,
  isExpectedWebhookPayload,
  parseInboundMessages,
  persistWhatsAppMessage,
  verifyMetaSignature,
} from '@/lib/api/_services/whatsapp';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const verifyToken = getRuntimeEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  if (!verifyToken) {
    return NextResponse.json(
      { error: 'webhook não configurado (WHATSAPP_WEBHOOK_VERIFY_TOKEN ausente)' },
      { status: 503 }
    );
  }
  const url = new URL(request.url);
  if (getWebhookAuthMode() === 'payload') {
    const check = checkWebhookUrlSecret(url, getRuntimeEnv('WHATSAPP_WEBHOOK_URL_SECRET'));
    if (check === 'missing-config') {
      return NextResponse.json(
        { error: 'webhook não configurado (WHATSAPP_WEBHOOK_URL_SECRET ausente)' },
        { status: 503 }
      );
    }
    if (check === 'invalid') {
      return NextResponse.json({ error: 'verificação inválida' }, { status: 403 });
    }
  }
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    // A Meta espera o challenge cru em texto puro, status 200.
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.json({ error: 'verificação inválida' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const authMode = getWebhookAuthMode();

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    /* body vazio cai na autenticação inválida abaixo */
  }

  let payload: unknown = null;
  if (authMode === 'hmac') {
    const appSecret = getRuntimeEnv('META_APP_SECRET');
    if (!appSecret) {
      // Fail-closed: sem o secret não dá pra distinguir Meta de atacante.
      return NextResponse.json(
        { error: 'webhook não configurado (META_APP_SECRET ausente)' },
        { status: 503 }
      );
    }
    const signature = request.headers.get('x-hub-signature-256');
    const valid = await verifyMetaSignature(rawBody, signature, appSecret);
    if (!valid) {
      return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });
    }
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = null;
    }
  } else {
    // Modo Dualhook: (1) segredo de URL autentica o remetente; (2) o
    // envelope precisa ser do NOSSO WABA + número.
    const check = checkWebhookUrlSecret(
      new URL(request.url),
      getRuntimeEnv('WHATSAPP_WEBHOOK_URL_SECRET')
    );
    if (check === 'missing-config') {
      // Fail-closed: sem segredo, payload sozinho não autentica ninguém.
      return NextResponse.json(
        { error: 'webhook não configurado (WHATSAPP_WEBHOOK_URL_SECRET ausente)' },
        { status: 503 }
      );
    }
    if (check === 'invalid') {
      return NextResponse.json({ error: 'token inválido' }, { status: 401 });
    }
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return NextResponse.json({ error: 'payload inválido' }, { status: 401 });
    }
    const expected = { wabaId: getWabaId(), phoneNumberId: getPhoneNumberId() };
    if (!isExpectedWebhookPayload(payload, expected)) {
      console.warn('[whatsapp-webhook] payload rejeitado (WABA/phone_number_id não conferem)');
      return NextResponse.json({ error: 'payload inesperado' }, { status: 401 });
    }
  }

  // Daqui pra baixo é sempre 200 (anti-retry-storm).
  try {
    const messages = parseInboundMessages(payload);
    for (const msg of messages) {
      // Log estruturado → Cloudflare logs. Não logar o corpo inteiro
      // (conversa de cliente); preview basta pra depurar entrega.
      console.log(
        `[whatsapp-webhook] msg de ${msg.from} (${msg.profileName || 'sem nome'}) ` +
          `type=${msg.type} id=${msg.messageId} preview="${msg.text.slice(0, 60)}"`
      );
    }
    // SQL Wave 38: grava em `whatsapp_messages` (best-effort; wamid UNIQUE
    // dedupa retries da Meta). Falha vira log — a resposta segue 200.
    const persisted = await Promise.all(
      messages.map((msg) =>
        persistWhatsAppMessage({
          direction: 'in',
          waId: msg.from,
          profileName: msg.profileName,
          messageId: msg.messageId,
          type: msg.type,
          body: msg.text,
          waTimestamp: msg.timestamp,
        })
      )
    );
    if (persisted.some((ok) => !ok)) {
      console.warn('[whatsapp-webhook] falha ao persistir parte das mensagens (best-effort)');
    }
  } catch (e) {
    console.error(
      'whatsapp-webhook: falha ao processar payload (200 mesmo assim):',
      e instanceof Error ? e.message : e
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
