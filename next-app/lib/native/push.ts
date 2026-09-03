// push.ts — registro de push NATIVO (FCM/APNs) via plugin da casca.
//
// ESCOPO ATUAL: só o lado do device — pedir permissão, registrar e devolver
// o token. A PERSISTÊNCIA (tabela de device tokens) e o ENVIO (FCM no
// servidor, estendendo /api/push-notify) são o próximo passo do plano e NÃO
// existem ainda: quem chamar isto hoje recebe o token e decide o que fazer.
// O web push (VAPID/PushOptIn) é outro canal e continua intocado.

import { getPlugin, isNativePlatform } from './platform';

interface TokenEvent {
  value: string;
}
interface ListenerHandle {
  remove: () => Promise<void> | void;
}
interface ActionEvent {
  // Estrutura do @capacitor/push-notifications: o `data` da notificação
  // (que o fcm.ts manda com `url`) vem em `notification.data`.
  notification?: { data?: Record<string, unknown> };
}
interface PushPlugin {
  requestPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' }>;
  register: () => Promise<void>;
  addListener: (
    event: 'registration' | 'registrationError' | 'pushNotificationActionPerformed',
    cb: (ev: TokenEvent | { error?: unknown } | ActionEvent) => void,
  ) => Promise<ListenerHandle> | ListenerHandle;
}

/**
 * Extrai a rota interna de destino do `data` da notificação. Pura e
 * exportada pra teste. Só aceita path relativo que começa com "/" (anti
 * open-redirect: uma notificação forjada não deve navegar pra fora).
 */
export function routeFromNotificationData(
  data: Record<string, unknown> | undefined,
): string | null {
  const url = data?.url;
  if (typeof url !== 'string') return null;
  return url.startsWith('/') && !url.startsWith('//') ? url : null;
}

const REGISTRATION_TIMEOUT_MS = 15_000; // lição do WebView: nada pendura sem teto

export function isNativePushAvailable(): boolean {
  return isNativePlatform() && !!getPlugin<PushPlugin>('PushNotifications');
}

/**
 * Pede permissão e registra o device. Resolve com o token FCM/APNs, ou null
 * quando: fora da casca, plugin ausente, permissão negada, erro ou timeout.
 */
export async function registerNativePush(): Promise<string | null> {
  const push = getPlugin<PushPlugin>('PushNotifications');
  if (!isNativePlatform() || !push) return null;
  try {
    const perm = await push.requestPermissions();
    if (perm.receive !== 'granted') return null;
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const handles: ListenerHandle[] = [];
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        for (const h of handles) {
          try {
            void h.remove();
          } catch {
            /* já removido */
          }
        }
        resolve(token);
      };
      const timer = setTimeout(() => finish(null), REGISTRATION_TIMEOUT_MS);
      Promise.all([
        Promise.resolve(
          push.addListener('registration', (ev) =>
            finish((ev as TokenEvent).value ?? null),
          ),
        ),
        Promise.resolve(
          push.addListener('registrationError', () => finish(null)),
        ),
      ])
        .then((hs) => {
          handles.push(...hs);
          return push.register();
        })
        .catch(() => finish(null));
    });
  } catch {
    return null;
  }
}

/**
 * Registra o handler de TOQUE na notificação: quando o usuário toca numa
 * push (com o app aberto ou fechado), o SO entrega o evento e navegamos pra
 * rota do `data.url`. Sem isto, o toque abre o app SEMPRE na tela inicial —
 * a notificação perde o destino. `onNavigate` é injetado por um componente
 * client (tem o router do Next). Retorna uma função de cleanup.
 * No-op fora da casca / sem plugin.
 */
export function initNativePushTapRouting(
  onNavigate: (path: string) => void,
): () => void {
  const push = getPlugin<PushPlugin>('PushNotifications');
  if (!isNativePlatform() || !push) return () => {};
  let handle: ListenerHandle | undefined;
  Promise.resolve(
    push.addListener('pushNotificationActionPerformed', (ev) => {
      const path = routeFromNotificationData((ev as ActionEvent).notification?.data);
      if (path) onNavigate(path);
    }),
  )
    .then((h) => {
      handle = h;
    })
    .catch(() => {
      /* plugin recusou o listener — toque cai na tela inicial (degradação ok) */
    });
  return () => {
    try {
      void handle?.remove();
    } catch {
      /* já removido */
    }
  };
}
