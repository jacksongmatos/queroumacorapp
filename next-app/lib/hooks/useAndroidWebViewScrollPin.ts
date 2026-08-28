// Trava o pull-to-refresh NATIVO do wrapper Android (WebIntoApp).
//
// Contexto (ver docs/ANDROID_BUILD.md, seção 2026-08-22): o AAB da Play
// Store envolve a WebView num SwipeRefreshLayout, que decide se arma o
// gesto de recarregar chamando canChildScrollUp() — "o documento ainda pode
// subir?". Como o app é um shell de 100dvh + overflow hidden e quem rola é
// o <main> INTERNO, o documento raiz está eternamente em scrollY 0 e a
// resposta é sempre "não": o reload fica armado na tela inteira, em
// qualquer posição do feed. Arrasto rápido pra baixo = círculo de reload.
//
// O truque daqui: dar 2px de rolagem REAL ao documento (body minHeight
// 100vh + 2px) e mantê-lo preso em scrollY = 1. Com o documento "fora do
// topo", canChildScrollUp() responde "sim" e o SwipeRefreshLayout nunca
// intercepta — o CSS/JS não alcança o nativo, mas o estado de scroll do
// documento SIM, porque é ele que o nativo consulta. O deslocamento de 1px
// é invisível (BottomNav é position:fixed; o shell desloca 1px pra cima).
//
// Escopo: SÓ no WebView Android (token `; wv)` no user-agent, padrão do
// System WebView — https://android-developers.googleblog.com/2024/12/
// user-agent-reduction-on-android-webview.html). Chrome, PWA, iOS e
// desktop não entram: neles o pull-to-refresh é do navegador e já é
// tratado por `overscroll-behavior` + useNoPullToRefresh.
//
// Isso NÃO substitui desligar o "Pull to Refresh" no painel do WebIntoApp
// (que continua sendo a correção de raiz) — mas chega HOJE em todo mundo
// que já instalou o app, sem regenerar AAB nem revisão da Play Store.
'use client';

import { useEffect } from 'react';

/** Altura extra do body — o "espaço" de rolagem real que o documento ganha. */
const EXTRA_SCROLL_PX = 2;
/** Posição em que o documento fica preso (0 < pin < extra). */
const PIN_PX = 1;

/**
 * Detecta o WebView do Android pelo user-agent. O System WebView carrega o
 * token `; wv)`; o WebIntoApp usa o System WebView, então herda o token —
 * e alguns geradores anexam o próprio nome, coberto pelo segundo teste.
 * Exportada pura pra teste unitário.
 */
export function isAndroidWebView(ua: string): boolean {
  if (!/Android/i.test(ua)) return false;
  return /;\s?wv\)/.test(ua) || /WebIntoApp/i.test(ua);
}

export function useAndroidWebViewScrollPin(): void {
  useEffect(() => {
    if (!isAndroidWebView(navigator.userAgent || '')) return;

    const body = document.body;
    const prevMinHeight = body.style.minHeight;
    // `vh` e não `dvh` de propósito: no WebView não existe barra de URL que
    // encolhe, então 100vh == altura real da janela e o documento ganha
    // EXATAMENTE os 2px de rolagem — nada visível muda.
    body.style.minHeight = `calc(100vh + ${EXTRA_SCROLL_PX}px)`;

    const pin = () => {
      if (window.scrollY < PIN_PX) window.scrollTo(0, PIN_PX);
    };

    // rAF: espera o layout aplicar o minHeight antes do primeiro pin.
    const raf = requestAnimationFrame(pin);
    // Re-pin em tudo que pode devolver o documento ao topo: scroll
    // programático/autoscroll de foco (scroll), teclado abre/fecha (resize)
    // e retomada do WebView congelado pelo sistema (pageshow/visibility —
    // mesmo ciclo de vida que exigiu o SESSION_TIMEOUT no boot).
    window.addEventListener('scroll', pin, { passive: true });
    window.addEventListener('resize', pin);
    window.addEventListener('pageshow', pin);
    document.addEventListener('visibilitychange', pin);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', pin);
      window.removeEventListener('resize', pin);
      window.removeEventListener('pageshow', pin);
      document.removeEventListener('visibilitychange', pin);
      body.style.minHeight = prevMinHeight;
    };
  }, []);
}
