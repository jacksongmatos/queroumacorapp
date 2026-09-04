// statusBar.ts — controla a barra de status nativa (relógio/bateria) pra ela
// combinar com o tema do app, em vez de ficar preta/branca fixa denunciando a
// WebView. No-op fora da casca (no navegador quem manda é o SO/browser).
//
// `style` DARK = ícones claros (fundo escuro); LIGHT = ícones escuros (fundo
// claro). O app tem TopNav escura fixa, então por padrão a barra combina com
// ela (ícones claros). Quando o tema muda, reavaliamos.

import { getPlugin, isNativePlatform } from './platform';

interface StatusBarPlugin {
  setStyle?: (opts: { style: 'DARK' | 'LIGHT' | 'DEFAULT' }) => Promise<void>;
  setBackgroundColor?: (opts: { color: string }) => Promise<void>;
  setOverlaysWebView?: (opts: { overlay: boolean }) => Promise<void>;
}

/**
 * Aplica a barra de status combinando com o topo do app. `bg` é a cor de
 * fundo (Android; iOS ignora e usa só o style). `iconsLight=true` = ícones
 * claros (pra fundo escuro), que é o caso da TopNav escura do QueroUmaCor.
 */
export function applyStatusBar(opts?: {
  iconsLight?: boolean;
  bg?: string;
}): void {
  const plugin = getPlugin<StatusBarPlugin>('StatusBar');
  if (!isNativePlatform() || !plugin) return;
  const iconsLight = opts?.iconsLight ?? true;
  const bg = opts?.bg ?? '#1a1a2e'; // mesma cor do backgroundColor da casca.
  try {
    // A barra NÃO sobrepõe o conteúdo (o app já reserva safe-area no CSS;
    // sobrepor empurraria o conteúdo pra baixo dos ícones).
    plugin.setOverlaysWebView?.({ overlay: false })?.catch?.(() => {});
    // style DARK = ícones claros. (Nomenclatura do plugin: o "style" descreve
    // o CONTEÚDO da status bar, não o fundo.)
    plugin.setStyle?.({ style: iconsLight ? 'DARK' : 'LIGHT' })?.catch?.(() => {});
    plugin.setBackgroundColor?.({ color: bg })?.catch?.(() => {});
  } catch {
    // barra de status é cosmético — nunca derruba o boot.
  }
}
