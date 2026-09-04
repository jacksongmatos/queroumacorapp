// badge.ts — número no ícone do app (mensagens/avisos pendentes). Usa o plugin
// 'Badge' (@capawesome/capacitor-badge) quando presente. No iOS o badge também
// chega pela push (campo `badge`); isto cobre o estado em foreground e o
// Android. No-op fora da casca ou sem o plugin/permissão — nunca lança.

import { getPlugin, isNativePlatform } from './platform';

interface BadgePlugin {
  set?: (opts: { count: number }) => Promise<void>;
  clear?: () => Promise<void>;
}

/** Define o número do badge (0 limpa). Best-effort. */
export function setAppBadge(count: number): void {
  const plugin = getPlugin<BadgePlugin>('Badge');
  if (!isNativePlatform() || !plugin) return;
  try {
    if (count > 0) plugin.set?.({ count })?.catch?.(() => {});
    else plugin.clear?.()?.catch?.(() => {});
  } catch {
    /* badge é cosmético — nunca derruba nada. */
  }
}
