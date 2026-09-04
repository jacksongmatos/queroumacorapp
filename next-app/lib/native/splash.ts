// splash.ts — esconde a splash nativa quando o app web já pintou a 1ª tela,
// matando a "tela branca" entre o splash e o conteúdo. A duração/auto-hide
// ficam no capacitor.config; aqui garantimos o hide explícito assim que o
// React montou (com um teto de segurança pra nunca deixar a splash presa).
// No-op fora da casca.

import { getPlugin, isNativePlatform } from './platform';

interface SplashScreenPlugin {
  hide?: (opts?: { fadeOutDuration?: number }) => Promise<void>;
}

let hidden = false;

/** Esconde a splash nativa uma vez, com fade curto. Idempotente. */
export function hideSplash(): void {
  if (hidden) return;
  const plugin = getPlugin<SplashScreenPlugin>('SplashScreen');
  if (!isNativePlatform() || !plugin?.hide) return;
  hidden = true;
  try {
    plugin.hide({ fadeOutDuration: 200 })?.catch?.(() => {});
  } catch {
    // ignore — a config tem autoHide como rede de segurança.
  }
}
