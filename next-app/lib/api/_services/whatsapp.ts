// lib/api/_services/whatsapp.ts — cliente do WhatsApp Cloud API (Meta Graph).
//
// A Cali Colors tem um número oficial na Cloud API (+55 11 95976-5031,
// app "CaliColors Integracao API"). Este service encapsula o envio de
// mensagens via `https://graph.facebook.com/<versão>/<PHONE_NUMBER_ID>/messages`
// com Bearer auth.
//
// Config (edge do Cloudflare — SEMPRE via `getRuntimeEnv`, nunca
// `process.env` direto; ver lib/api/env.ts):
//   - `WHATSAPP_ACCESS_TOKEN`   (secret) — token permanente do system user.
//     NUNCA commitar; vive só no painel do CF Pages.
//   - `WHATSAPP_PHONE_NUMBER_ID` — opcional; default abaixo (não é secret).
//   - `META_APP_SECRET`          (secret) — valida assinatura do webhook.
//   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — string escolhida por nós, conferida
//     no GET de verificação do webhook (Meta manda de volta).
//
// Regra da janela de 24h da Meta: mensagem de TEXTO livre só chega pra quem
// mandou mensagem pro número nas últimas 24h; fora da janela é obrigatório
// usar TEMPLATE aprovado. O erro 131047 do Graph indica exatamente isso —
// traduzimos pra mensagem acionável.

import { getRuntimeEnv } from '../env';
import { getServiceKey, getSupabaseUrl, ServiceError } from '../security';

export const GRAPH_API_VERSION = 'v21.0';

/**
 * IDs do WhatsApp Business da Cali Colors. NÃO são secrets (aparecem em URL
 * de API e no painel da Meta) — ficam como default pra reduzir setup a uma
 * env só (o token). Env correspondente sobrescreve se o número mudar.
 */
export const DEFAULT_PHONE_NUMBER_ID = '109293361953640'; // +55 11 95976-5031
export const DEFAULT_WABA_ID = '102067872689175'; // CaliColors Tintas

const GRAPH_TIMEOUT_MS = 15000;

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

/** Lê a config de runtime. Throw 503 se o token não estiver no ambiente. */
export function getWhatsAppConfig(): WhatsAppConfig {
  const token = getRuntimeEnv('WHATSAPP_ACCESS_TOKEN') || '';
  if (!token) {
    throw new ServiceError(
      'WhatsApp Cloud API não configurada (WHATSAPP_ACCESS_TOKEN ausente)',
      503
    );
  }
  const phoneNumberId =
    getRuntimeEnv('WHATSAPP_PHONE_NUMBER_ID') || DEFAULT_PHONE_NUMBER_ID;
  return { token, phoneNumberId };
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(getRuntimeEnv('WHATSAPP_ACCESS_TOKEN'));
}

/**
 * Normaliza telefone brasileiro pra E.164 sem `+` (formato que o Graph
 * espera em `to`). Aceita `(11) 95976-5031`, `11959765031`,
 * `5511959765031`, `+55 11 95976-5031`… Retorna null se não parecer um
 * número BR válido.
 */
export function normalizeBrPhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // Já com DDI 55: DDD (2) + 8 ou 9 dígitos.
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // Sem DDI: DDD (2) + 8 (fixo) ou 9 (celular) dígitos.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}

// ─── Payloads (puros, testáveis) ────────────────────────────────────────────

export interface TemplateComponent {
  type: string;
  parameters?: unknown[];
  [key: string]: unknown;
}

export function buildTextPayload(to: string, body: string): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  };
}

export function buildTemplatePayload(
  to: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[]
): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components && components.length > 0 ? { components } : {}),
    },
  };
}

// ─── Envio ──────────────────────────────────────────────────────────────────

export interface SendResult {
  messageId: string;
  /** wa_id do destinatário como a Meta normalizou (pode diferir do `to`). */
  waId: string;
}

interface GraphMessagesResponse {
  messages?: Array<{ id?: string }>;
  contacts?: Array<{ wa_id?: string }>;
  error?: { message?: string; code?: number; error_subcode?: number };
}

/** POST no /messages do Graph. Payload já montado pelos builders acima. */
export async function sendWhatsAppMessage(
  payload: Record<string, unknown>
): Promise<SendResult> {
  const { token, phoneNumberId } = getWhatsAppConfig();
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch {
    throw new ServiceError('falha de rede ao chamar o WhatsApp Cloud API', 502);
  }

  let data: GraphMessagesResponse = {};
  try {
    data = (await res.json()) as GraphMessagesResponse;
  } catch {
    /* corpo não-JSON cai na checagem de status abaixo */
  }

  if (!res.ok || data.error) {
    const code = data.error?.code;
    // 131047: fora da janela de 24h — texto livre não entrega, precisa de
    // template aprovado. Erro mais comum na prática; mensagem acionável.
    if (code === 131047 || data.error?.error_subcode === 131047) {
      throw new ServiceError(
        'destinatário fora da janela de 24h — use um template aprovado',
        422
      );
    }
    // 190: token expirado/revogado.
    if (code === 190) {
      throw new ServiceError(
        'token do WhatsApp inválido ou expirado (regenerar no painel Meta)',
        502
      );
    }
    const detail = (data.error?.message || `HTTP ${res.status}`).slice(0, 200);
    throw new ServiceError(`WhatsApp Cloud API recusou o envio: ${detail}`, 502);
  }

  return {
    messageId: data.messages?.[0]?.id || '',
    waId: data.contacts?.[0]?.wa_id || '',
  };
}

export async function sendWhatsAppText(opts: {
  to: string;
  body: string;
}): Promise<SendResult> {
  const to = normalizeBrPhone(opts.to);
  if (!to) throw new ServiceError('telefone de destino inválido', 400);
  return sendWhatsAppMessage(buildTextPayload(to, opts.body));
}

export async function sendWhatsAppTemplate(opts: {
  to: string;
  template: string;
  languageCode?: string;
  components?: TemplateComponent[];
}): Promise<SendResult> {
  const to = normalizeBrPhone(opts.to);
  if (!to) throw new ServiceError('telefone de destino inválido', 400);
  return sendWhatsAppMessage(
    buildTemplatePayload(to, opts.template, opts.languageCode || 'pt_BR', opts.components)
  );
}

// ─── Persistência (SQL Wave 38: tabela whatsapp_messages) ───────────────────

export interface PersistWhatsAppMessageInput {
  direction: 'in' | 'out';
  waId: string;
  profileName?: string;
  /** wamid da Meta. UNIQUE no banco — retry de webhook não duplica linha. */
  messageId?: string;
  type?: string;
  body?: string;
  template?: string;
  /** UUID do admin que enviou (só direction='out'). */
  sentBy?: string;
  /** Epoch em SEGUNDOS como a Meta manda (string). */
  waTimestamp?: string;
}

const PERSIST_TIMEOUT_MS = 8000;

/**
 * Grava uma mensagem (recebida ou enviada) em `whatsapp_messages` via REST
 * com service_role. BEST-EFFORT: retorna false em qualquer falha (tabela
 * ainda não criada, env ausente, rede) — persistir nunca pode custar o 200
 * do webhook nem uma mensagem já enviada com sucesso.
 */
export async function persistWhatsAppMessage(
  input: PersistWhatsAppMessageInput
): Promise<boolean> {
  try {
    const url = getSupabaseUrl();
    const serviceKey = getServiceKey();
    if (!url || !serviceKey) return false;

    let waTimestamp: string | null = null;
    if (input.waTimestamp && /^\d+$/.test(input.waTimestamp)) {
      const d = new Date(Number(input.waTimestamp) * 1000);
      if (!Number.isNaN(d.getTime())) waTimestamp = d.toISOString();
    }

    const row = {
      direction: input.direction,
      wa_id: input.waId,
      profile_name: input.profileName || null,
      message_id: input.messageId || null, // '' vira NULL (UNIQUE permite múltiplos)
      type: input.type || 'text',
      body: input.body || null,
      template: input.template || null,
      sent_by: input.sentBy || null,
      wa_timestamp: waTimestamp,
    };

    const res = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/whatsapp_messages?on_conflict=message_id`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          // ignore-duplicates: retry de webhook da Meta (mesmo wamid) vira no-op.
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(PERSIST_TIMEOUT_MS),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Webhook: verificação de assinatura ─────────────────────────────────────

/**
 * Valida o header `X-Hub-Signature-256` do webhook da Meta:
 * `sha256=<hex do HMAC-SHA256(app_secret, rawBody)>`. Comparação
 * constant-time. Edge-safe (só crypto.subtle).
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const provided = signatureHeader.slice('sha256='.length).toLowerCase();

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(appSecret) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(rawBody) as unknown as BufferSource)
  );
  let expected = '';
  for (let i = 0; i < mac.length; i++) {
    expected += mac[i].toString(16).padStart(2, '0');
  }

  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Webhook: parse do payload de entrada ───────────────────────────────────

export interface InboundWhatsAppMessage {
  from: string;
  messageId: string;
  timestamp: string;
  type: string;
  /** Corpo quando type='text'; vazio pra mídia/interactive. */
  text: string;
  /** Nome de perfil do remetente, quando a Meta manda. */
  profileName: string;
}

/**
 * Extrai as mensagens recebidas do envelope de webhook da Meta
 * (`entry[].changes[].value.messages[]`). Status de entrega
 * (`value.statuses[]`) são ignorados aqui — caller decide se loga.
 */
export function parseInboundMessages(payload: unknown): InboundWhatsAppMessage[] {
  const out: InboundWhatsAppMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      const contacts = Array.isArray(value?.contacts)
        ? (value.contacts as Array<{ wa_id?: string; profile?: { name?: string } }>)
        : [];
      for (const msg of messages as Array<Record<string, unknown>>) {
        const from = typeof msg.from === 'string' ? msg.from : '';
        const contact = contacts.find((c) => c.wa_id === from) || contacts[0];
        out.push({
          from,
          messageId: typeof msg.id === 'string' ? msg.id : '',
          timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : '',
          type: typeof msg.type === 'string' ? msg.type : 'unknown',
          text:
            typeof (msg.text as { body?: unknown } | undefined)?.body === 'string'
              ? ((msg.text as { body: string }).body)
              : '',
          profileName: contact?.profile?.name || '',
        });
      }
    }
  }
  return out;
}
