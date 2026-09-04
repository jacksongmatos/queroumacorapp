// NativeChrome — inicializa as capacidades de "casca" no boot: barra de
// status combinando com o topo escuro do app, teclado sem pulo, e some com a
// splash nativa assim que a 1ª tela pintou. Reaplica a status bar quando o app
// volta do background (o SO costuma resetá-la). Tudo no-op fora da casca
// (Capacitor), então é seguro montar sempre — no navegador/PWA não faz nada.
//
// Montado uma vez no AppShell. Renderiza null.

'use client';

import { useEffect } from 'react';
import { applyStatusBar, initKeyboard, hideSplash, onAppResume } from '@/lib/native';

export function NativeChrome() {
  useEffect(() => {
    // A TopNav do app é escura e fixa (--color-ink-fixed não inverte no dark),
    // então a barra de status combina com ela sempre: ícones claros sobre
    // fundo escuro, independente do tema claro/escuro do conteúdo.
    applyStatusBar({ iconsLight: true, bg: '#1a1a2e' });
    initKeyboard();
    // Esconde a splash no próximo frame — o React já montou o shell, então o
    // que a pessoa vê a seguir é a UI, não a tela branca.
    const t = requestAnimationFrame(() => hideSplash());

    // Ao voltar do background a status bar às vezes volta ao padrão do SO
    // (ícones escuros sobre a TopNav escura = invisíveis). Reaplica.
    const off = onAppResume(() => {
      applyStatusBar({ iconsLight: true, bg: '#1a1a2e' });
    });

    return () => {
      cancelAnimationFrame(t);
      off();
    };
  }, []);

  return null;
}
