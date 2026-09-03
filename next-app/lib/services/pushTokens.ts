// pushTokens.ts — persistência de device tokens de push NATIVO (FCM/APNs).
//
// Canal separado do web push (`push_subscriptions`/VAPID): o app empacotado
// (WebView) não tem Web Push, então a casca Capacitor registra via plugin e
// o token FCM/APNs fica em `push_device_tokens` (SQL Wave 39). Mesmo padrão
// RLS user-owned do web push: o client grava a própria linha; o ENVIO
// (server → FCM) lê via service_role e é a etapa seguinte do plano.
//
import { getSupabase } from '../supabase';
import { native } from '../native';

export interface RegisterDeviceTokenResult {
  ok: boolean;
  /** 'unavailable' = fora da casca/sem plugin; 'denied' = permissão negada
   *  ou registro falhou; 'error' = gravação no banco falhou. */
  reason?: 'unavailable' | 'denied' | 'error';
}

/**
 * Pede permissão, registra o device no FCM/APNs e persiste o token na conta.
 * Idempotente: UNIQUE(token) no banco + upsert — re-registrar só atualiza
 * `last_seen_at`/dono. Best-effort: nunca lança.
 */
export async function registerDeviceToken(
  userId: string,
): Promise<RegisterDeviceTokenResult> {
  if (!userId || !native.push.isAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }
  const token = await native.push.register();
  if (!token) return { ok: false, reason: 'denied' };
  try {
    const sb = getSupabase();
    const { error } = await sb.from('push_device_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: native.platform(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    if (error) return { ok: false, reason: 'error' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
