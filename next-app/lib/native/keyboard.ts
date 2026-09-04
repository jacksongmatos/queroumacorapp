// keyboard.ts — comportamento do teclado nativo em chat/formulários.
//
// O problema clássico da WebView: ao abrir o teclado, o layout "pula", o input
// fica escondido atrás do teclado e o scroll enlouquece. O plugin 'Keyboard'
// controla o modo de resize e o accessory bar. No-op fora da casca (no browser
// quem cuida disso é o `interactive-widget`/visualViewport do próprio Chrome).

import { getPlugin, isNativePlatform } from './platform';

interface KeyboardPlugin {
  setResizeMode?: (opts: { mode: 'native' | 'body' | 'ionic' | 'none' }) => Promise<void>;
  setScroll?: (opts: { isDisabled: boolean }) => Promise<void>;
  setAccessoryBarVisible?: (opts: { isVisible: boolean }) => Promise<void>;
}

/** Configura o teclado uma vez no boot da casca. */
export function initKeyboard(): void {
  const plugin = getPlugin<KeyboardPlugin>('Keyboard');
  if (!isNativePlatform() || !plugin) return;
  try {
    // 'native': o Android/iOS redimensiona a WebView pra área acima do
    // teclado — o layout do app (100dvh + main rolável) se ajusta sozinho,
    // sem pulo. 'body'/'ionic' assumem layout Ionic, que não é o nosso.
    plugin.setResizeMode?.({ mode: 'native' })?.catch?.(() => {});
    // O app faz seu próprio scroll no <main>; deixar o WebView também rolar
    // brigava com o overscroll-contain do pull-to-refresh.
    plugin.setScroll?.({ isDisabled: true })?.catch?.(() => {});
    // Accessory bar (barra cinza "Concluído" do iOS) some — o app tem seus
    // próprios botões de enviar.
    plugin.setAccessoryBarVisible?.({ isVisible: false })?.catch?.(() => {});
  } catch {
    // teclado é ajuste fino — nunca derruba o boot.
  }
}
