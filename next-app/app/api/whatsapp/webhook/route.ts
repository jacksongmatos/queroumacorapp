// app/api/whatsapp/webhook/route.ts — webhook do WhatsApp Cloud API (Meta).
//
// GET  = verificação de assinatura do webhook (painel da Meta ou Dualhook):
//        confere `hub.verify_token` contra WHATSAPP_WEBHOOK_VERIFY_TOKEN e
//        devolve `hub.challenge` em texto puro.
// POST = eventos (mensagens recebidas + status de entrega). Duas checagens,
//        nesta ordem:
//          1. o `?token=` da URL contra WHATSAPP_WEBHOOK_URL_SECRET
//             (constant-time) — é ISTO que autentica o remetente;
//          2. o envelope: `object` = whatsapp_business_account, `entry[].id`
//             = WHATSAPP_WABA_ID e `metadata.phone_number_id` =
//             WHATSAPP_PHONE_NUMBER_ID.
//        Qualquer falha → 403.
//
// O `X-Hub-Signature-256` NÃO é mais validado no POST (2026-09-05). Com a
// WABA inscrita no app Meta DO DUALHOOK, a assinatura é feita com o App
// Secret deles — que não é exposto —, então o HMAC com META_APP_SECRET
// jamais bateria e todo POST caía em 401. Os IDs do envelope, sozinhos, não
// autenticam ninguém (são públicos): quem faz esse papel é o segredo de URL.
//
// Passou nas duas: responde 200 NA HORA e processa o payload depois da
// resposta (`runAfterResponse` → `ctx.waitUntil` do worker). A Meta espera
// resposta rápida e desativa webhook que demora ou falha; gravar no banco
// antes de responder colocava a latência do Supabase no caminho dela.
//
// O POST reconhece, loga, persiste (console → Cloudflare logs; tabela
// `whatsapp_messages`) e dispara o ATENDIMENTO AUTOMÁTICO. Este último elo
// faltava: o `maybeAutoReply` só era chamado pelo webhook da Evolution, que
// foi aposentada — a IA parou de responder sem ninguém notar, porque a
// mensagem continuava chegando no portal normalmente.

import { type NextRequest, NextResponse } from 'next/server';
import { getRuntimeEnv, runAfterResponse } from '@/lib/api/env';
import {
  checkWebhookUrlSecret,
  getPhoneNumberId,
  getWabaId,
  getWebhookAuthMode,
  isExpectedWebhookPayload,
  parseInboundMessages,
  persistWhatsAppMessage,
  resumirEnvelope,
  type InboundWhatsAppMessage,
} from '@/lib/api/_services/whatsapp';
import { maybeAutoReply } from '@/lib/api/_services/whatsapp-ai-runner';

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

/**
 * Loga e grava as mensagens. Roda DEPOIS da resposta (ver `runAfterResponse`),
 * então nada aqui pode afetar o status — só o log conta o que aconteceu.
 */
async function processarEntrada(messages: InboundWhatsAppMessage[]): Promise<void> {
  for (const msg of messages) {
    // Log estruturado → Cloudflare logs. Não logar o corpo inteiro
    // (conversa de cliente); preview basta pra depurar entrega.
    console.log(
      `[whatsapp-webhook] msg de ${msg.from} (${msg.profileName || 'sem nome'}) ` +
        `type=${msg.type} id=${msg.messageId} preview="${msg.text.slice(0, 60)}"`
    );
  }
  // SQL Wave 38: grava em `whatsapp_messages` (best-effort; wamid UNIQUE
  // dedupa retries da Meta).
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

  // Atendimento automático. SÓ pra mensagem de texto recebida — nunca pra
  // 'out', senão a IA responderia a si mesma em loop. O runner é best-effort
  // e decide sozinho se age (horário, opt-out, teto diário, chave da
  // conversa); aqui só registramos o que ele decidiu.
  //
  // Roda DEPOIS da resposta (este `processarEntrada` inteiro está no
  // waitUntil), então a IA pode levar o tempo dela sem atrasar o 200 que a
  // Meta espera.
  for (const msg of messages) {
    const texto = (msg.text || '').trim();
    if (!texto) continue;
    try {
      const r = await maybeAutoReply({ waId: msg.from, text: texto });
      console.log(`[whatsapp-webhook] ia ${msg.from}: ${r.acted ? '✓' : '·'} ${r.why}`);
    } catch (e) {
      // maybeAutoReply promete não lançar; se lançar mesmo assim, não pode
      // derrubar o trabalho de fundo das outras mensagens.
      console.error(
        '[whatsapp-webhook] runner da IA falhou:',
        e instanceof Error ? e.message : e
      );
    }
  }
}

export async function POST(request: NextRequest) {
  // (1) Segredo de URL — o que realmente autentica o remetente.
  const check = checkWebhookUrlSecret(
    new URL(request.url),
    getRuntimeEnv('WHATSAPP_WEBHOOK_URL_SECRET')
  );
  if (check !== 'ok') {
    // Fail-closed também quando a env falta: sem segredo não dá pra
    // distinguir a Meta de qualquer um. O motivo vai no corpo — 403 sozinho
    // não diferencia "env não subiu" de "token errado", e essa distinção é
    // a primeira pergunta de quem for depurar.
    console.warn(`[whatsapp-webhook] POST recusado: url-secret ${check}`);
    return NextResponse.json(
      {
        error: 'não autorizado',
        reason: check === 'missing-config' ? 'url_secret_ausente' : 'token_invalido',
      },
      { status: 403 }
    );
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    /* body vazio cai no parse abaixo */
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'não autorizado', reason: 'payload_invalido' },
      { status: 403 }
    );
  }

  // (2) O envelope tem que ser do NOSSO WABA + número.
  const expected = { wabaId: getWabaId(), phoneNumberId: getPhoneNumberId() };
  if (!isExpectedWebhookPayload(payload, expected)) {
    // Nomear os dois lados é o ponto: este 403 é INVISÍVEL pra quem usa o
    // portal (a entrega some, nada aparece na tela), então esta linha é a
    // única pista. Recebido × esperado responde na hora se o caso é env
    // errada no Cloudflare ou webhook apontado pra outra conta.
    console.warn(
      `[whatsapp-webhook] payload rejeitado — recebido: ${resumirEnvelope(payload)} | ` +
        `esperado: waba=${expected.wabaId} phone_number_id=${expected.phoneNumberId}`
    );
    return NextResponse.json(
      { error: 'não autorizado', reason: 'payload_inesperado' },
      { status: 403 }
    );
  }

  // Autenticado: 200 IMEDIATO, processamento depois da resposta. O parse é
  // barato e fica aqui pra um payload malformado não sumir no silêncio do
  // trabalho de fundo; o que custa (Supabase) é que vai pro waitUntil.
  let messages: InboundWhatsAppMessage[] = [];
  try {
    messages = parseInboundMessages(payload);
  } catch (e) {
    console.error(
      'whatsapp-webhook: falha ao ler o payload (200 mesmo assim):',
      e instanceof Error ? e.message : e
    );
  }
  if (messages.length > 0) runAfterResponse(processarEntrada(messages));

  return NextResponse.json({ received: true }, { status: 200 });
}
