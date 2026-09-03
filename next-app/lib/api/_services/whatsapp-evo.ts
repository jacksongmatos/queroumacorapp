// lib/api/_services/whatsapp-evo.ts — cliente do Evolution API (WhatsApp
// não-oficial via Baileys, self-hosted no Render).
//
// Contexto (2026-08-28): a Cloud API da Meta ainda não autenticou, então o
// portal usa SOMENTE a Evolution até isso sair — número secundário
// +55 11 92072-5935 (instância `meu-whatsapp`), separado do oficial da loja
// (+55 11 95976-5031, que segue reservado pra Meta). A rota /api/whatsapp/send
// despacha pra cá quando as envs abaixo existem.
//
// Config (edge do Cloudflare — SEMPRE getRuntimeEnv, nunca process.env):
//   - `EVOLUTION_API_URL`      — ex.: https://evolution-api-8arv.onrender.com
//   - `EVOLUTION_API_KEY`      (secret) — AUTHENTICATION_API_KEY do Render.
//   - `EVOLUTION_INSTANCE`     — opcional; default 'meu-whatsapp'.
//   - `EVOLUTION_WEBHOOK_TOKEN`(secret) — string aleatória NOSSA, conferida
//     no `?token=` do webhook (a Evolution não assina eventos como a Meta,
//     então o segredo vai na URL configurada no Manager).
//
// Quem espera o cold start do Render é o NAVEGADOR (o portal pinga a URL
// base direto antes de chamar a rota); o edge só faz o envio rápido.

import { getRuntimeEnv } from '../env';
import { ServiceError } from '../security';

// 14s, NÃO 25s nem 55s: o Cloudflare mata a function do edge quando o
// upstream fica pendurado (comprovado 2026-08-28 — o 502 cru do CF chegava
// na tela ANTES do nosso timeout responder JSON). 25s não bastou: somado ao
// que a rota gasta antes (auth + rate limit) e depois (gravar a mensagem +
// audit), o total passava da linha do CF e o operador via de novo a página
// "502 Bad gateway" (2026-08-31, na abordagem de lead). O teto agora é
// ORÇAMENTO, não chute: envio + sonda cabem na deadline da rota (ver
// ROUTE_DEADLINE_MS em app/api/whatsapp/send/route.ts).
const SEND_TIMEOUT_MS = 14000;

// Sonda curta do estado da instância, usada SÓ quando o envio estoura o
// tempo. É o que separa as duas causas com o mesmo sintoma: Render frio
// (instância 'open', só lenta — tentar de novo resolve) × sessão do
// WhatsApp caída ('close'/'connecting' — aí o Baileys pendura pra sempre,
// timeout nenhum resolve e alguém precisa reconectar o QR no Manager).
const STATE_PROBE_TIMEOUT_MS = 4000;

export const DEFAULT_EVOLUTION_INSTANCE = 'meu-whatsapp';

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

export function getEvolutionConfig(): EvolutionConfig {
  const baseUrl = (getRuntimeEnv('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const apiKey = getRuntimeEnv('EVOLUTION_API_KEY') || '';
  if (!baseUrl || !apiKey) {
    throw new ServiceError(
      'Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY ausentes)',
      503
    );
  }
  return {
    baseUrl,
    apiKey,
    instance: getRuntimeEnv('EVOLUTION_INSTANCE') || DEFAULT_EVOLUTION_INSTANCE,
  };
}

export function isEvolutionConfigured(): boolean {
  return Boolean(getRuntimeEnv('EVOLUTION_API_URL') && getRuntimeEnv('EVOLUTION_API_KEY'));
}

// ─── Normalização do destino ────────────────────────────────────────────────

/**
 * Resolve o número de destino do WhatsApp SEM assumir que todo mundo é do
 * Brasil.
 *
 * Bug que isso corrige (2026-08-28): o envio usava `normalizeBrPhone`, que
 * colava '55' em qualquer número de 10-11 dígitos. Um contato dos EUA
 * (`16503154274` = +1 650 315-4274) virava `5516503154274` — número
 * inexistente. O Baileys ficava pendurado tentando resolver esse JID e o
 * Cloudflare matava a function antes de qualquer resposta: era a origem do
 * "502 Bad gateway" no envio, com o diagnóstico do edge todo verde.
 *
 * Regras (em ordem):
 *   - já com DDI 55 e 12-13 dígitos → Brasil, passa direto;
 *   - 10 dígitos (DDD + fixo) → Brasil local, ganha o 55;
 *   - 11 dígitos com 9 no 3º dígito (DDD + celular) → Brasil local, ganha 55;
 *   - 11-15 dígitos em qualquer outro formato → JÁ tem DDI de outro país
 *     (EUA, Portugal…), passa VERBATIM;
 *   - resto → inválido.
 */
export function normalizeWhatsAppTarget(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10) return `55${digits}`;
  if (digits.length === 11 && digits[2] === '9') return `55${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits; // DDI estrangeiro
  return null;
}

// ─── Envio ──────────────────────────────────────────────────────────────────

/** Body do POST /message/sendText/<instance> (puro, testável). */
export function buildEvoTextBody(number: string, text: string): Record<string, unknown> {
  return { number, text };
}

interface EvoSendResponse {
  key?: { id?: string; remoteJid?: string };
  status?: string;
  message?: unknown;
  error?: unknown;
  response?: { message?: unknown };
}

export interface EvoSendResult {
  messageId: string;
  waId: string;
}

/**
 * Estado da instância no Evolution (`open` | `connecting` | `close`), ou
 * null quando nem isso responde. Chamada SÓ no caminho de falha — sonda
 * curta, pra não gastar orçamento do envio no caminho feliz.
 */
export async function probeInstanceState(): Promise<string | null> {
  try {
    const { baseUrl, apiKey, instance } = getEvolutionConfig();
    const res = await fetch(
      `${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`,
      { headers: { apikey: apiKey }, signal: AbortSignal.timeout(STATE_PROBE_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { instance?: { state?: string }; state?: string };
    return data?.instance?.state || data?.state || null;
  } catch {
    return null;
  }
}

/**
 * Traduz o estouro de tempo do envio na causa REAL, perguntando à Evolution
 * em que estado a instância está. Sem isso o operador recebia sempre o mesmo
 * texto ("o Render dorme") — que desde 2026-08-29 é falso: o plano é pago e
 * não dorme mais. Sessão caída e servidor lento pediam ações opostas e
 * chegavam com a mesma cara.
 */
async function explainSendTimeout(instance: string): Promise<string> {
  const state = await probeInstanceState();
  if (state === 'close' || state === 'connecting') {
    return `a instância "${instance}" está ${state === 'close' ? 'DESCONECTADA' : 'reconectando'} no Evolution — nenhuma mensagem sai enquanto isso. Abra o Manager e leia o QR de novo pra reconectar o número da loja.`;
  }
  if (state === 'open') {
    return 'o WhatsApp está conectado, mas o servidor não respondeu a tempo (provável cold start do Render). Espere uns segundos e envie de novo — a mensagem NÃO saiu.';
  }
  return 'o servidor do WhatsApp (Evolution/Render) não respondeu a tempo e nem informou o estado da conexão. Confira o serviço no Render e a instância no Manager.';
}

/**
 * Envia texto livre pelo Evolution API. Sem janela de 24h (não é a Meta) —
 * texto sempre pode. Timeout longo por causa do cold start do Render.
 */
export async function sendEvolutionText(opts: {
  to: string;
  body: string;
}): Promise<EvoSendResult> {
  const to = normalizeWhatsAppTarget(opts.to);
  if (!to) throw new ServiceError('telefone de destino inválido', 400);
  const text = (opts.body || '').trim();
  if (!text) throw new ServiceError('mensagem vazia', 400);

  const { baseUrl, apiKey, instance } = getEvolutionConfig();
  const url = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildEvoTextBody(to, text)),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    throw new ServiceError(
      timeout ? await explainSendTimeout(instance) : 'falha de rede ao chamar o Evolution API',
      502
    );
  }

  let data: EvoSendResponse = {};
  try {
    data = (await res.json()) as EvoSendResponse;
  } catch {
    /* status decide abaixo */
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ServiceError('Evolution API recusou a apikey (conferir EVOLUTION_API_KEY)', 502);
    }
    if (res.status === 404) {
      throw new ServiceError(
        `instância "${instance}" não encontrada no Evolution (conferir EVOLUTION_INSTANCE / conexão no Manager)`,
        502
      );
    }
    const detail = JSON.stringify(data?.response?.message ?? data?.error ?? data).slice(0, 200);
    throw new ServiceError(`Evolution API recusou o envio (HTTP ${res.status}): ${detail}`, 502);
  }

  return {
    messageId: data.key?.id || '',
    waId: jidToPhone(data.key?.remoteJid || '') || to,
  };
}

// ─── Webhook: parse dos eventos ─────────────────────────────────────────────

/** `5511999999999@s.whatsapp.net` → `5511999999999`. Grupo/broadcast → ''. */
export function jidToPhone(jid: string): string {
  if (!jid || typeof jid !== 'string') return '';
  if (jid.endsWith('@g.us') || jid.includes('broadcast')) return '';
  const user = jid.split('@')[0].split(':')[0];
  const digits = user.replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
}

export interface EvoInboundMessage {
  direction: 'in' | 'out';
  /** Telefone (dígitos) do interlocutor externo. */
  waId: string;
  messageId: string;
  type: string;
  text: string;
  profileName: string;
  /** Epoch em segundos (string), como persistWhatsAppMessage espera. */
  timestamp: string;
  /** Item cru do webhook — onde mora o base64 da mídia, quando vem. */
  raw?: unknown;
  /** Chave da mensagem, pra pedir a mídia à Evolution quando não vier. */
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
}

/** Extrai texto de qualquer shape de `message` do Baileys. */
function extractText(message: Record<string, unknown> | undefined): { type: string; text: string } {
  if (!message) return { type: 'unknown', text: '' };
  const m = message as {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { fileName?: string };
    audioMessage?: unknown;
    stickerMessage?: unknown;
  };
  if (typeof m.conversation === 'string') return { type: 'text', text: m.conversation };
  if (typeof m.extendedTextMessage?.text === 'string') {
    return { type: 'text', text: m.extendedTextMessage.text };
  }
  if (m.imageMessage) return { type: 'image', text: m.imageMessage.caption || '[imagem]' };
  if (m.videoMessage) return { type: 'video', text: m.videoMessage.caption || '[vídeo]' };
  if (m.audioMessage) return { type: 'audio', text: '[áudio]' };
  if (m.stickerMessage) return { type: 'sticker', text: '[figurinha]' };
  if (m.documentMessage) {
    return { type: 'document', text: m.documentMessage.fileName || '[documento]' };
  }
  return { type: 'unknown', text: '' };
}

/**
 * Parse do webhook do Evolution API (evento MESSAGES_UPSERT / messages.upsert).
 * Aceita `data` como objeto único OU array (varia por versão/config). Ignora
 * grupos, broadcast e eventos que não são de mensagem. `fromMe=true` vira
 * direction='out' (resposta mandada do próprio celular também entra no
 * histórico do portal).
 */
export function parseEvolutionWebhook(payload: unknown): EvoInboundMessage[] {
  const out: EvoInboundMessage[] = [];
  const p = payload as { event?: string; data?: unknown } | null;
  const event = String(p?.event || '').toLowerCase().replace(/_/g, '.');
  if (event && event !== 'messages.upsert') return out;

  const items = Array.isArray(p?.data) ? (p?.data as unknown[]) : p?.data ? [p.data] : [];
  for (const item of items) {
    const d = item as {
      key?: { remoteJid?: string; fromMe?: boolean; id?: string };
      pushName?: string;
      message?: Record<string, unknown>;
      messageTimestamp?: number | string;
    };
    const waId = jidToPhone(d?.key?.remoteJid || '');
    if (!waId) continue; // grupo/broadcast/jid inválido — fora do escopo
    const { type, text } = extractText(d?.message);
    if (type === 'unknown' && !text) continue; // protocolo/reação/etc.
    const tsRaw = d?.messageTimestamp;
    const timestamp =
      typeof tsRaw === 'number'
        ? String(Math.floor(tsRaw))
        : typeof tsRaw === 'string' && /^\d+$/.test(tsRaw)
          ? tsRaw
          : '';
    out.push({
      direction: d?.key?.fromMe ? 'out' : 'in',
      waId,
      messageId: d?.key?.id || '',
      type,
      text,
      profileName: d?.pushName || '',
      timestamp,
      // Cru + chave: o download da mídia precisa deles (o base64 pode vir
      // no proprio payload ou ser buscado na Evolution pela chave).
      raw: item,
      key: d?.key || undefined,
    });
  }
  return out;
}
