// appState.ts — ciclo de vida do app nativo (foreground/background).
//
// Usa o plugin 'App' (JÁ instalado — o mesmo do deep link do OAuth). Quando o
// app volta do background, a WebView pode ter sido congelada; reagir ao
// `resume` deixa explícito o momento de revalidar sessão, recarregar o chat,
// refrescar dados — o que hoje só acontecia por `visibilitychange` web (que na
// WebView nem sempre dispara). No-op fora da casca; o caller já tem os
// listeners web equivalentes.

import { getPlugin, isNativePlatform } from './platform';

interface PluginListenerHandle {
  remove: () => Promise<void> | void;
}
interface AppPlugin {
  addListener?: (
    event: string,
    cb: (data: unknown) => void,
  ) => Promise<PluginListenerHandle> | PluginListenerHandle;
}

type Unsubscribe = () => void;

function noop(): void {}

/**
 * Chama `cb` toda vez que o app volta pro foreground. Retorna uma função de
 * limpeza. Fora da casca retorna no-op (o caller usa visibilitychange web).
 */
export function onAppResume(cb: () => void): Unsubscribe {
  const plugin = getPlugin<AppPlugin>('App');
  if (!isNativePlatform() || !plugin?.addListener) return noop;

  let handle: PluginListenerHandle | undefined;
  let cancelled = false;

  const onState = (data: unknown) => {
    // appStateChange manda { isActive: boolean }. resume não manda payload.
    const active = (data as { isActive?: boolean })?.isActive;
    if (active === undefined || active === true) cb();
  };

  try {
    const r = plugin.addListener('appStateChange', onState);
    if (r && typeof (r as Promise<PluginListenerHandle>).then === 'function') {
      (r as Promise<PluginListenerHandle>)
        .then((h) => {
          if (cancelled) h.remove();
          else handle = h;
        })
        .catch(() => {});
    } else {
      handle = r as PluginListenerHandle;
    }
  } catch {
    return noop;
  }

  return () => {
    cancelled = true;
    try {
      handle?.remove();
    } catch {
      // ignore
    }
  };
}
