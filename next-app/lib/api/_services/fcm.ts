// fcm.ts — envio de push NATIVO (FCM HTTP v1) no edge, zero deps.
//
// Canal separado do Web Push (VAPID/aes128gcm em push-notify): o app
// empacotado roda em WebView, que não tem Web Push. A casca Capacitor
// registra o device via @capacitor/push-notifications e grava o token FCM/
// APNs em `push_device_tokens` (Wave 39). Aqui o servidor lê esses tokens e
// dispara via FCM HTTP v1.
//
// Autenticação FCM v1 = OAuth2 com service account:
//   1. Monta um JWT RS256 assinado com a private key do service account.
//   2. Troca o JWT por um access_token em oauth2.googleapis.com/token.
//   3. POST em fcm.googleapis.com/v1/projects/<id>/messages:send por token.
// Tudo com `crypto.subtle` + `fetch` (mesmo padrão do VAPID ES256 da rota
// de web push) — nenhuma lib de servidor Firebase (elas não rodam no edge).
//
// ENVs (secrets no painel CF Pages, lidas por getRuntimeEnv):
//   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (PEM PKCS8, com \n).
// Ausentes → o canal nativo simplesmente não envia (best-effort), igual o
// web push sem VAPID.

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_TIMEOUT_MS = 8000;
const SEND_TIMEOUT_MS = 8000;

export interface FcmServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKeyPem: string;
}

export interface FcmPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
  tag?: string;
}

export type FcmSendStatus = 'sent' | 'expired' | 'error';

// ─── base64url (sem padding) ────────────────────────────────────────────────

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8Base64Url(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

// ─── PEM PKCS8 → ArrayBuffer ────────────────────────────────────────────────

/**
 * Converte a private key PEM (PKCS8) do service account num ArrayBuffer pro
 * `crypto.subtle.importKey`. Tolera `\n` literais (como as envs guardam) e
 * quebras reais. Pura e exportada pra teste.
 */
export function pemToPkcs8(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n');
  const b64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─── Classificação da resposta do FCM ───────────────────────────────────────

/**
 * Decide o que fazer com o token a partir da resposta do FCM v1. Token morto
 * (app desinstalado / registro trocado) → 'expired' (remover da tabela).
 * FCM v1 sinaliza isso com 404 UNREGISTERED ou 400 INVALID_ARGUMENT no campo
 * do token. Pura e exportada pra teste.
 */
export function classifyFcmResult(statusCode: number, body: string): FcmSendStatus {
  if (statusCode >= 200 && statusCode < 300) return 'sent';
  if (statusCode === 404 || statusCode === 410) return 'expired';
  if (statusCode === 400 && /UNREGISTERED|INVALID_ARGUMENT|registration-token/i.test(body)) {
    return 'expired';
  }
  return 'error';
}

// ─── Access token (cache por isolate quente) ────────────────────────────────

let _cachedToken: { token: string; expiresAt: number } | null = null;

export function __resetFcmTokenCacheForTests(): void {
  _cachedToken = null;
}

async function getAccessToken(sa: FcmServiceAccount): Promise<string | null> {
  // Reusa enquanto faltar > 60s pra expirar — evita re-assinar a cada push.
  if (_cachedToken && _cachedToken.expiresAt - Date.now() > 60_000) {
    return _cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = utf8Base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = utf8Base64Url(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;

  let assertion: string;
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(sa.privateKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signingInput),
    );
    assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
  } catch {
    return null; // private key malformada — canal nativo fica inerte
  }

  try {
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    _cachedToken = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
  } catch {
    return null;
  }
}

// ─── Envio ──────────────────────────────────────────────────────────────────

function buildFcmMessage(token: string, payload: FcmPayload) {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      // `data` é o que o handler nativo lê pra abrir a tela certa no clique.
      data: { url: payload.url, ...(payload.tag ? { tag: payload.tag } : {}) },
      android: { priority: 'HIGH' as const, notification: { default_sound: true } },
      apns: { payload: { aps: { sound: 'default' } } },
    },
  };
}

async function sendOne(
  projectId: string,
  accessToken: string,
  token: string,
  payload: FcmPayload,
): Promise<FcmSendStatus> {
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildFcmMessage(token, payload)),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    );
    if (res.ok) return 'sent';
    const body = await res.text().catch(() => '');
    return classifyFcmResult(res.status, body);
  } catch {
    return 'error';
  }
}

export interface DeviceTokenRow {
  id: string;
  token: string;
}

export interface FcmSendResult {
  sent: number;
  /** ids de `push_device_tokens` a remover (token morto). */
  expiredIds: string[];
  total: number;
}

/**
 * Envia `payload` pra uma lista de tokens de device. Best-effort: token morto
 * entra em `expiredIds` pro caller limpar; erro de rede não derruba os outros.
 * Retorna contadores. Se o access token não sair, devolve tudo zerado.
 */
export async function sendFcmToDeviceTokens(
  sa: FcmServiceAccount,
  rows: DeviceTokenRow[],
  payload: FcmPayload,
): Promise<FcmSendResult> {
  if (rows.length === 0) return { sent: 0, expiredIds: [], total: 0 };
  const accessToken = await getAccessToken(sa);
  if (!accessToken) return { sent: 0, expiredIds: [], total: rows.length };

  const results = await Promise.all(
    rows.map((r) =>
      sendOne(sa.projectId, accessToken, r.token, payload).then((status) => ({
        status,
        id: r.id,
      })),
    ),
  );
  return {
    sent: results.filter((r) => r.status === 'sent').length,
    expiredIds: results.filter((r) => r.status === 'expired').map((r) => r.id),
    total: rows.length,
  };
}
