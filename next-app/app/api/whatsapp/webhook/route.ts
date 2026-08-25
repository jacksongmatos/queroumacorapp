// app/api/whatsapp/webhook/route.ts — webhook do WhatsApp Cloud API (Meta).
//
// GET  = verificação de assinatura do webhook no painel da Meta:
//        confere `hub.verify_token` contra WHATSAPP_WEBHOOK_VERIFY_TOKEN e
//        devolve `hub.challenge` em texto puro.
// POST = eventos (mensagens recebidas + status de entrega). Assinado pela
//        Meta com HMAC-SHA256 do App Secret sobre o RAW body, no header
//        `X-Hub-Signature-256` — validamos ANTES de qualquer parse.
//
// Anti-retry-storm (mesma filosofia do mp-webhook): depois da assinatura
// válida, SEMPRE 200 — falha nossa de processamento não pode fazer a Meta
// martelar (ela desativa webhook com muitas falhas). 401 só pra assinatura
// inválida; 503 só pra secret não configurado.
//
// Por enquanto o POST só reconhece e loga (console → Cloudflare logs).
// Persistir mensagem recebida em tabela própria / responder automático é
// etapa futura — exige decisão de schema (não misturar com `messages` do
// chat interno, que é user↔user com FK em profiles).

import { type NextRequest, NextResponse } from 'next/server';
import { getRuntimeEnv } from '@/lib/api/env';
import {
  parseInboundMessages,
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
  const appSecret = getRuntimeEnv('META_APP_SECRET');
  if (!appSecret) {
    // Fail-closed: sem o secret não dá pra distinguir Meta de atacante.
    return NextResponse.json(
      { error: 'webhook não configurado (META_APP_SECRET ausente)' },
      { status: 503 }
    );
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    /* body vazio cai na assinatura inválida abaixo */
  }

  const signature = request.headers.get('x-hub-signature-256');
  const valid = await verifyMetaSignature(rawBody, signature, appSecret);
  if (!valid) {
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });
  }

  // Daqui pra baixo é sempre 200 (anti-retry-storm).
  try {
    const payload = JSON.parse(rawBody) as unknown;
    const messages = parseInboundMessages(payload);
    for (const msg of messages) {
      // Log estruturado → Cloudflare logs. Não logar o corpo inteiro
      // (conversa de cliente); preview basta pra depurar entrega.
      console.log(
        `[whatsapp-webhook] msg de ${msg.from} (${msg.profileName || 'sem nome'}) ` +
          `type=${msg.type} id=${msg.messageId} preview="${msg.text.slice(0, 60)}"`
      );
    }
  } catch (e) {
    console.error(
      'whatsapp-webhook: falha ao processar payload (200 mesmo assim):',
      e instanceof Error ? e.message : e
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
