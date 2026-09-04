// network.ts — estado de conexão. Na casca usa o plugin 'Network' (mais
// confiável que o navigator.onLine da WebView, que às vezes mente ao voltar do
// background); fora dela usa navigator.onLine + eventos online/offline. Serve
// pra mostrar "sem conexão" em vez de deixar a WebView só falhar.

import { getPlugin, isNativePlatform } from './platform';

interface NetworkPlugin {
  getStatus?: () => Promise<{ connected: boolean }>;
  addListener?: (
    event: 'networkStatusChange',
    cb: (s: { connected: boolean }) => void,
  ) => Promise<{ remove: () => void }> | { remove: () => void };
}

/** Melhor palpite síncrono do estado atual (pra render inicial). */
export function isOnlineNow(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true; // sem sinal → assume online (não bloquear a UI à toa).
}

type Unsub = () => void;
function noop(): void {}

/**
 * Assina mudanças de conectividade. `cb(connected)` roda a cada transição.
 * Retorna limpeza. Usa o plugin quando disponível; senão, os eventos web.
 */
export function onNetworkChange(cb: (connected: boolean) => void): Unsub {
  const plugin = getPlugin<NetworkPlugin>('Network');
  if (isNativePlatform() && plugin?.addListener) {
    let handle: { remove: () => void } | undefined;
    let cancelled = false;
    try {
      const r = plugin.addListener('networkStatusChange', (s) => cb(!!s.connected));
      if (r && typeof (r as Promise<{ remove: () => void }>).then === 'function') {
        (r as Promise<{ remove: () => void }>)
          .then((h) => {
            if (cancelled) h.remove();
            else handle = h;
          })
          .catch(() => {});
      } else {
        handle = r as { remove: () => void };
      }
    } catch {
      return noop;
    }
    return () => {
      cancelled = true;
      try {
        handle?.remove();
      } catch {
        /* ignore */
      }
    };
  }
  // Fallback web.
  if (typeof window === 'undefined') return noop;
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
}
