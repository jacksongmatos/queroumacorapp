// lib/api/_services/whatsapp.ts — cliente do WhatsApp Cloud API (Meta Graph).
//
// A Cali Colors tem um número oficial na Cloud API (+55 11 95976-5031,
// app "CaliColors Integracao API"). Este service encapsula o envio de
// mensagens via `https://api.dualhook.com/<versão>/<PHONE_NUMBER_ID>/messages`
// (o Dualhook espelha o contrato da Cloud API — mesmo path, mesmo corpo,
// mesmo formato de resposta; muda a base e o Bearer)
// com Bearer auth.
//
// Config (edge do Cloudflare — SEMPRE via `getRuntimeEnv`, nunca
// `process.env` direto; ver lib/api/env.ts):
//   - `DUALHOOK_API_KEY`         (secret) — Outbound API key do Dualhook
//     (`dh_live_…`). NUNCA commitar; vive só no painel do CF Pages.
//     Substituiu o `WHATSAPP_ACCESS_TOKEN` em 2026-09-05: com o número em
//     Coexistence gerenciado pelo app Meta do Dualhook, o token do NOSSO app
//     não tem permissão nesse phone_number_id. O envio passa por eles.
//   - `WHATSAPP_PHONE_NUMBER_ID` — opcional; default abaixo (não é secret).
//   - `WHATSAPP_WABA_ID`         — opcional; default abaixo (não é secret).
//   - `WHATSAPP_WEBHOOK_AUTH_MODE` — `payload` (default) ou `hmac`. Ver
//     abaixo em "Webhook: autenticação do POST".
//   - `META_APP_SECRET`          (secret) — só no modo `hmac`.
//   - `WHATSAPP_WEBHOOK_URL_SECRET` (secret) — obrigatório no modo `payload`:
//     string alta-entropia que vai na query da URL cadastrada no Dualhook
//     (`.../api/whatsapp/webhook?token=<secret>`). É o que prova que a
//     chamada veio de quem conhece a URL (Meta via Dualhook), já que o
//     payload sozinho é forjável (WABA/phone id são públicos).
//   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — string escolhida por nós, conferida
//     no GET de verificação do webhook (Meta manda de volta). Com Dualhook,
//     é o Verify Token gerado no painel deles (Webhook Override).
//
// Webhook: autenticação do POST. Desde a migração pro Dualhook (Coexistence
// via Embedded Signup), o header `X-Hub-Signature-256` é assinado pelo app
// Meta DO DUALHOOK, cujo App Secret não é exposto — logo o HMAC com o nosso
// `META_APP_SECRET` NUNCA bate. A recomendação do Dualhook é validar o
// FORMATO do payload (`isExpectedWebhookPayload`): envelope
// `whatsapp_business_account`, `entry[].id` = nosso WABA e
// `metadata.phone_number_id` = nosso número — MAIS o segredo de URL
// (`WHATSAPP_WEBHOOK_URL_SECRET`), porque IDs no corpo não autenticam
// remetente. O modo `hmac` fica disponível pra voltar ao app próprio (sem
// Dualhook) sem mexer em código.
//
// Regra da janela de 24h da Meta: mensagem de TEXTO livre só chega pra quem
// mandou mensagem pro número nas últimas 24h; fora da janela é obrigatório
// usar TEMPLATE aprovado. O erro 131047 do Graph indica exatamente isso —
// traduzimos pra mensagem acionável.

import { getRuntimeEnv } from '../env';
import { normalizeWhatsAppTarget } from './whatsapp-evo';
import { getServiceKey, getSupabaseUrl, ServiceError } from '../security';

// O Dualhook espelha o contrato da Cloud API: mesmo path
// `/<versão>/<PHONE_NUMBER_ID>/messages`, mesmo corpo, mesma forma de erro.
// Só a base e o header de auth mudam — por isso os builders de payload não
// precisaram de nenhuma alteração.
export const DUALHOOK_API_BASE = 'https://api.dualhook.com';
export const GRAPH_API_VERSION = 'v25.0';

/**
 * IDs do WhatsApp Business da Cali Colors. NÃO são secrets (aparecem em URL
 * de API e no painel da Meta) — ficam como default pra reduzir setup a uma
 * env só (o token). Env correspondente sobrescreve se o número mudar.
 *
 * ATENÇÃO ao que estes números significam: o TELEFONE é o mesmo de sempre.
 * O que mudou em 2026-09-05 foi o REGISTRO — ao entrar em Coexistence pelo
 * Dualhook, a Meta emitiu um `phone_number_id` e uma WABA novos pro mesmo
 * aparelho. Os IDs antigos (`109293361953640` / `102067872689175`, do
 * cadastro direto da Cali Colors) não recebem nem enviam mais nada.
 *
 * Por que eles PRECISAVAM sair daqui: um default errado não falha, ele
 * MENTE. No envio, a URL apontava pra um número que não é nosso e o
 * Dualhook recusava; no recebimento era pior — `isExpectedWebhookPayload`
 * comparava o envelope contra a WABA velha e devolvia 403 pra TODA entrega,
 * ou seja, silêncio total no portal, sem erro em lugar nenhum. As envs
 * continuam podendo sobrescrever, mas agora o caminho sem env é o certo.
 */
export const DEFAULT_PHONE_NUMBER_ID = '1220273824510260'; // Dualhook (Coexistence)
export const DEFAULT_WABA_ID = '1320667299892030'; // WABA da conexão Dualhook

const GRAPH_TIMEOUT_MS = 15000;

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

/** Lê a config de runtime. Throw 503 se a chave não estiver no ambiente. */
export function getWhatsAppConfig(): WhatsAppConfig {
  const token = getRuntimeEnv('DUALHOOK_API_KEY') || '';
  if (!token) {
    throw new ServiceError(
      'envio de WhatsApp não configurado (DUALHOOK_API_KEY ausente)',
      503
    );
  }
  const phoneNumberId =
    getRuntimeEnv('WHATSAPP_PHONE_NUMBER_ID') || DEFAULT_PHONE_NUMBER_ID;
  return { token, phoneNumberId };
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(getRuntimeEnv('DUALHOOK_API_KEY'));
}

/** WABA ID do runtime (env sobrescreve o default da Cali Colors). */
export function getWabaId(): string {
  return getRuntimeEnv('WHATSAPP_WABA_ID') || DEFAULT_WABA_ID;
}

/** Phone Number ID do runtime, sem exigir o access token (uso no webhook). */
export function getPhoneNumberId(): string {
  return getRuntimeEnv('WHATSAPP_PHONE_NUMBER_ID') || DEFAULT_PHONE_NUMBER_ID;
}

export type WebhookAuthMode = 'payload' | 'hmac';

/** Modo de autenticação do POST do webhook. Qualquer valor ≠ `hmac` → `payload`. */
export function getWebhookAuthMode(): WebhookAuthMode {
  return getRuntimeEnv('WHATSAPP_WEBHOOK_AUTH_MODE') === 'hmac' ? 'hmac' : 'payload';
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

/** POST no /messages do Dualhook. Payload já montado pelos builders acima. */
export async function sendWhatsAppMessage(
  payload: Record<string, unknown>
): Promise<SendResult> {
  const { token, phoneNumberId } = getWhatsAppConfig();
  const url = `${DUALHOOK_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

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
    // 500, não 502: ver o comentário do bloco de erro abaixo — o Cloudflare
    // troca o corpo do 502 pela página dele e a explicação some.
    console.error('dualhook_send_failed', { status: 0, body: 'network' });
    throw new ServiceError('falha de rede ao chamar a API do Dualhook', 500, {
      upstreamStatus: 0,
    });
  }

  // Lê o corpo como TEXTO primeiro: em falha ele vai inteiro pro log, e a
  // resposta do Dualhook nem sempre é JSON (proxy, HTML de erro, corpo
  // vazio). `res.json()` engoliria justamente o caso que mais precisa ser
  // visto.
  const rawText = await res.text().catch(() => '');
  let data: GraphMessagesResponse = {};
  try {
    data = JSON.parse(rawText) as GraphMessagesResponse;
  } catch {
    /* corpo não-JSON cai na checagem de status abaixo */
  }

  if (!res.ok || data.error) {
    // NUNCA 502/504 daqui pra baixo: o Cloudflare SUBSTITUI o corpo dessas
    // duas pela página de erro dele, e a mensagem que explica a falha se
    // perde no caminho — quem está no portal vê "502 Bad gateway" e não
    // sabe se foi credencial, janela de 24h ou número errado. Erro 4xx do
    // Dualhook vira 400 (a culpa é da nossa requisição), o resto vira 500.
    // O `upstreamStatus` viaja no corpo (ServiceError.extra) pra tela poder
    // mostrar o número real.
    console.error('dualhook_send_failed', { status: res.status, body: rawText });

    const upstreamStatus = res.status;
    const extra = { upstreamStatus };
    const httpStatus = res.status >= 400 && res.status < 500 ? 400 : 500;
    const code = data.error?.code;

    // 131047: fora da janela de 24h — texto livre não entrega, precisa de
    // template aprovado. Erro mais comum na prática; mensagem acionável.
    // Fica em 422 de propósito: é status próprio, não é substituído pelo
    // Cloudflare, e a tela já o distingue de falha genérica.
    if (code === 131047 || data.error?.error_subcode === 131047) {
      throw new ServiceError(
        'destinatário fora da janela de 24h — use um template aprovado',
        422,
        extra
      );
    }
    // 190: credencial expirada/revogada. Chega tanto do Dualhook quanto,
    // repassado, da Meta — a ação agora é regenerar a Outbound API key no
    // painel do Dualhook, não o token no painel da Meta.
    if (code === 190 || res.status === 401 || res.status === 403) {
      throw new ServiceError(
        'credencial do Dualhook inválida ou expirada (regenerar a Outbound API key)',
        httpStatus,
        extra
      );
    }
    const detail = (data.error?.message || `HTTP ${res.status}`).slice(0, 200);
    throw new ServiceError(`Dualhook recusou o envio: ${detail}`, httpStatus, extra);
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
  // `normalizeWhatsAppTarget`, NÃO `normalizeBrPhone` (2026-09-05). O
  // segundo cola '55' em qualquer coisa com 10-11 dígitos: o contato dos
  // EUA `16503154274` virava `5516503154274`, inexistente. Foi exatamente
  // isso que causou o 502 de 2026-08-28 no caminho da Evolution, e com o
  // Dualhook virando canal ÚNICO o mesmo erro voltaria por aqui.
  const to = normalizeWhatsAppTarget(opts.to);
  if (!to) throw new ServiceError('telefone de destino inválido', 400);
  return sendWhatsAppMessage(buildTextPayload(to, opts.body));
}

/**
 * `true` quando a falha é "fora da janela de 24h" da Meta (131047 → 422).
 * Quem envia em LOTE precisa distinguir isso de erro de verdade: não
 * adianta tentar de novo na próxima varredura, só um template aprovado
 * resolve. Sem essa distinção o follow-up martela o mesmo contato de hora
 * em hora, pra sempre.
 */
export function isForaDaJanela24h(e: unknown): boolean {
  return e instanceof ServiceError && e.status === 422;
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
  /** De onde saiu a mensagem 'out': portal (gente), ia (automática) ou
   *  celular (digitada no aparelho — só o webhook enxerga essa). */
  origin?: 'portal' | 'ia' | 'celular' | null;
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
  /** Caminho do arquivo no bucket `whatsapp-media` (foto/áudio/vídeo). */
  mediaUrl?: string | null;
  mediaMime?: string | null;
  /** Texto do áudio (Whisper) — o que a IA lê no lugar do "[áudio]". */
  transcript?: string | null;
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
      // Origem do envio (2026-08-30): 'portal' | 'ia' | 'celular'. É o que
      // permite marcar no portal quem está tocando cada conversa — antes
      // IA e celular eram indistinguíveis (os dois gravavam sent_by NULL).
      ...(input.origin ? { origin: input.origin } : {}),
      wa_timestamp: waTimestamp,
      ...(input.mediaUrl ? { media_url: input.mediaUrl } : {}),
      ...(input.mediaMime ? { media_mime: input.mediaMime } : {}),
      ...(input.transcript ? { transcript: input.transcript } : {}),
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

// ─── Webhook: segredo de URL (modo Dualhook) ────────────────────────────────

/** Compara duas strings em tempo constante (evita timing leak do token). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Confere o `?token=` da URL do webhook contra `WHATSAPP_WEBHOOK_URL_SECRET`.
 * Retorna 'ok' | 'missing-config' | 'invalid'. Sem env configurada é
 * fail-closed (503 no caller) — nunca aceitar sem segredo no modo payload.
 */
export function checkWebhookUrlSecret(
  url: URL,
  configured: string | undefined
): 'ok' | 'missing-config' | 'invalid' {
  if (!configured) return 'missing-config';
  const provided = url.searchParams.get('token') || '';
  return safeEqual(provided, configured) ? 'ok' : 'invalid';
}

// ─── Webhook: validação do formato do payload (modo Dualhook) ────────────────

/**
 * Confere se o envelope é o que a Meta manda pro NOSSO número: objeto
 * `whatsapp_business_account`, ao menos um `entry` e TODOS os entries com
 * `id` = nosso WABA, `changes` não vazio, todo change com `field='messages'`
 * e `value.metadata.phone_number_id` = nosso número. Qualquer desvio → false.
 *
 * Substitui o HMAC quando o webhook chega via Dualhook (assinatura deles,
 * não verificável). Não é autenticação criptográfica — é a validação que o
 * Dualhook recomenda; a URL do webhook deve continuar não-pública.
 */
export type WebhookVeredito = 'processar' | 'ignorar' | 'rejeitar';

/**
 * Classifica o envelope em três desfechos — e a distinção entre os dois
 * últimos é o ponto.
 *
 * A versão anterior devolvia só true/false, e o `false` virava 403. Só que
 * a Meta manda no MESMO webhook eventos que não são mensagem
 * (`message_template_status_update`, `account_update`, `phone_number_...`).
 * Todos caíam em 403 — e 403 pra Meta significa "não entreguei", então ela
 * REENVIA, indefinidamente, um evento que nunca teríamos processado.
 * Fila de retry crescendo por um evento que só precisava de um "ok, ignorei".
 *
 * - `processar`: nosso WABA, `field='messages'`, nosso `phone_number_id`.
 * - `ignorar`: nosso WABA, mas nenhum change de mensagem → 200 sem trabalho.
 * - `rejeitar`: envelope de outra conta ou malformado → 403.
 *
 * Um change de MENSAGEM com `phone_number_id` de outro número continua
 * sendo `rejeitar`: aí não é "evento que não me interessa", é entrega no
 * endereço errado, e engolir isso com 200 esconderia exatamente o tipo de
 * erro de configuração que custou o incidente dos defaults.
 *
 * Isto NÃO é autenticação — os IDs são públicos. Quem autentica é o segredo
 * de URL; esta função é validação de forma.
 */
export function classifyWebhookPayload(
  payload: unknown,
  expected: { wabaId: string; phoneNumberId: string }
): WebhookVeredito {
  if (!payload || typeof payload !== 'object') return 'rejeitar';
  const body = payload as { object?: unknown; entry?: unknown };
  if (body.object !== 'whatsapp_business_account') return 'rejeitar';
  if (!Array.isArray(body.entry) || body.entry.length === 0) return 'rejeitar';

  let temMensagem = false;
  for (const entry of body.entry as Array<Record<string, unknown>>) {
    if (!entry || typeof entry !== 'object') return 'rejeitar';
    if (String(entry.id ?? '') !== expected.wabaId) return 'rejeitar';
    const changes = entry.changes;
    if (!Array.isArray(changes) || changes.length === 0) return 'rejeitar';
    for (const change of changes as Array<Record<string, unknown>>) {
      if (!change || typeof change !== 'object') return 'rejeitar';
      if (change.field !== 'messages') continue; // evento de outro tipo
      const value = change.value as { metadata?: { phone_number_id?: unknown } } | undefined;
      if (String(value?.metadata?.phone_number_id ?? '') !== expected.phoneNumberId) {
        return 'rejeitar';
      }
      temMensagem = true;
    }
  }
  return temMensagem ? 'processar' : 'ignorar';
}

/**
 * Compatibilidade: só `processar` conta como "é o envelope que esperamos".
 * A ROTA usa `classifyWebhookPayload` — precisa separar ignorar de rejeitar.
 */
export function isExpectedWebhookPayload(
  payload: unknown,
  expected: { wabaId: string; phoneNumberId: string }
): boolean {
  return classifyWebhookPayload(payload, expected) === 'processar';
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

/**
 * Descreve, pra log, os IDs que vieram num envelope recusado.
 *
 * Existe porque "payload rejeitado" sozinho manda quem depura abrir o
 * Cloudflare, o Dualhook e o painel da Meta pra descobrir qual dos dois IDs
 * não bateu — e o modo de falha aqui é silêncio (403 pro Dualhook, nada no
 * portal), então a linha de log é a ÚNICA pista que sobra. Os IDs são
 * públicos: aparecem na URL da API e no painel, então logá-los não vaza
 * nada. Nunca inclui o conteúdo da conversa.
 */
export function resumirEnvelope(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'payload não é objeto';
  const body = payload as { object?: unknown; entry?: unknown };
  const partes = [`object=${String(body.object ?? '(ausente)')}`];
  const entry = Array.isArray(body.entry)
    ? (body.entry[0] as Record<string, unknown> | undefined)
    : undefined;
  partes.push(`waba=${String(entry?.id ?? '(ausente)')}`);
  const change = Array.isArray(entry?.changes)
    ? ((entry.changes as Array<Record<string, unknown>>)[0] as
        | Record<string, unknown>
        | undefined)
    : undefined;
  partes.push(`field=${String(change?.field ?? '(ausente)')}`);
  const value = change?.value as { metadata?: { phone_number_id?: unknown } } | undefined;
  partes.push(`phone_number_id=${String(value?.metadata?.phone_number_id ?? '(ausente)')}`);
  return partes.join(' ');
}
