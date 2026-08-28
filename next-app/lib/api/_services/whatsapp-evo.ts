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
// Render FREE dorme após ~15min: a 1ª request pós-sono pode levar ~50s.
// Por isso o timeout de envio é LONGO (55s) — o edge do CF aguenta esperar.

import { getRuntimeEnv } from '../env';
import { ServiceError } from '../security';
import { normalizeBrPhone } from './whatsapp';

// 25s, NÃO 55s: o Cloudflare mata a function do edge antes disso quando o
// upstream fica pendurado (comprovado 2026-08-28 — o 502 cru do CF chegava
// na tela ANTES do nosso timeout responder JSON). Quem espera o cold start
// do Render agora é o NAVEGADOR: o portal pinga a URL base direto (browser
// não tem esse teto) antes de chamar a rota, e o edge só faz o envio rápido.
const SEND_TIMEOUT_MS = 25000;

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
 * Envia texto livre pelo Evolution API. Sem janela de 24h (não é a Meta) —
 * texto sempre pode. Timeout longo por causa do cold start do Render.
 */
export async function sendEvolutionText(opts: {
  to: string;
  body: string;
}): Promise<EvoSendResult> {
  const to = normalizeBrPhone(opts.to);
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
      timeout
        ? 'o servidor do WhatsApp (Render) não respondeu em 55s — ele dorme após 15min parado; tente de novo em 1 minuto'
        : 'falha de rede ao chamar o Evolution API',
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
    });
  }
  return out;
}
