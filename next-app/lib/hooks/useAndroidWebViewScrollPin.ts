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
// A defesa tem TRÊS camadas (as duas últimas daqui; a primeira é inline):
//
// 1. PIN PRÉ-HIDRATAÇÃO (script inline no <head> do layout.tsx, mesmo
//    padrão do script de tema): sem ele, do primeiro byte até o React
//    hidratar o documento ficava em scrollY 0 e o gesto seguia armado
//    exatamente na janela do boot — quando um reload custa mais caro.
// 2. PIN CONTÍNUO (este hook): estica o body em 4px e mantém o documento
//    preso em scrollY = 2. Fora do topo, canChildScrollUp() responde "sim"
//    e o SwipeRefreshLayout nunca intercepta — CSS/JS não alcançam o toque
//    nativo, mas o ESTADO de scroll que ele consulta sim. 2px (e não 1) por
//    seguro contra arredondamento de page-scale; o deslocamento é invisível
//    (BottomNav é position:fixed; só os 2px de cima do shell clipam).
// 3. GUARDA DE DRENO (este hook): um arrasto pra baixo que NASCE fora do
//    <main> (TopNav, telas fora do AppShell como /login) encadeia no
//    scroller raiz e drenaria o pin 2→0 no meio do gesto — e o
//    SwipeRefreshLayout reavalia canChildScrollUp() a CADA move, então um
//    puxa-solta-puxa rápido ainda armava. O touchmove no document cancela
//    o gesto descendente quando nada na cadeia do alvo pode subir (mesma
//    lógica do useNoPullToRefresh, generalizada pro documento inteiro).
//
// Escopo: QUALQUER Android (2026-08-28 — antes era só UA com token `; wv)`,
// mas geradores tipo WebIntoApp podem customizar o user-agent e o pin
// ficava mudo sem nenhum sinal; "Android" no UA sobrevive a praticamente
// qualquer customização). No Chrome/PWA Android o efeito é inofensivo e
// até bem-vindo: o pin também impede o pull-to-refresh do PRÓPRIO Chrome
// (que exige scrollY 0). A altura extra usa `dvh` (com fallback `vh`)
// justamente pra barra de URL do Chrome não ganhar dezenas de px de scroll
// — dvh acompanha o viewport atual, então a folga é sempre 4px exatos.
// iOS e desktop ficam de fora: pull-to-refresh deles já é coberto por
// `overscroll-behavior` + useNoPullToRefresh onde importa.
//
// Isso NÃO substitui desligar o "Pull to Refresh" no painel do WebIntoApp
// (que continua sendo a correção de raiz, no próximo rebuild) — mas chega
// HOJE em todo mundo que já instalou o app, sem regenerar AAB.
'use client';

import { useEffect } from 'react';

/** Altura extra do body — o "espaço" de rolagem real que o documento ganha. */
const EXTRA_SCROLL_PX = 4;
/** Posição em que o documento fica preso (0 < pin < extra). */
const PIN_PX = 2;

/**
 * Gate do pin: qualquer Android. Espelhada no script inline do layout.tsx
 * (camada 1) — mudou aqui, mudar lá.
 */
export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

/**
 * Detecção estrita do WebView (token `; wv)` do System WebView, ou gerador
 * que anexa o próprio nome). Não é mais o gate do pin — vira flag no
 * diagnóstico, pra distinguir wrapper de Chrome/PWA no /admin/errors.
 */
export function isAndroidWebView(ua: string): boolean {
  if (!isAndroid(ua)) return false;
  return /;\s?wv\)/.test(ua) || /WebIntoApp/i.test(ua);
}

/** Sobe do alvo até (exclusive) o documentElement procurando um scroller
 *  que ainda pode subir — se existe, o gesto é rolagem legítima. */
function hasScrollableUpAncestor(from: EventTarget | null): boolean {
  let node = from instanceof Element ? from : null;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement && node.scrollTop > 0) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}

// O diagnóstico temporário (`scrollpin-diag`, 1 ping/sessão pro
// /api/log-error) foi REMOVIDO em 2026-08-30: cumpriu a missão — os pings
// de produção provaram que o UA do wrapper é "Dalvik/2.1.0 (Linux; U;
// Android 16; ...)" (sem token `wv`, sem Chrome), ou seja, o gate
// `/Android/i` pega o app instalado e o `isAndroidWebView` estrito não
// pegaria. A mesma telemetria fica registrada no /admin/errors histórico.

export function useAndroidWebViewScrollPin(): void {
  useEffect(() => {
    if (!isAndroid(navigator.userAgent || '')) return;

    const body = document.body;
    const prevMinHeight = body.style.minHeight;
    // dvh com fallback vh: dvh acompanha o viewport ATUAL (barra de URL do
    // Chrome recolhida ou não), então a folga é sempre 4px exatos. Em
    // WebView antigo sem dvh a segunda atribuição é rejeitada pela CSSOM e
    // fica o vh — que dentro do wrapper é a mesma coisa (sem barra de URL).
    body.style.minHeight = `calc(100vh + ${EXTRA_SCROLL_PX}px)`;
    body.style.minHeight = `calc(100dvh + ${EXTRA_SCROLL_PX}px)`;

    const pin = () => {
      if (window.scrollY < PIN_PX) window.scrollTo(0, PIN_PX);
    };

    // ── camada 3: guarda de dreno ────────────────────────────────────────
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onTouchStart = (e: TouchEvent) => {
      tracking = e.touches.length === 1; // pinch não é rolagem
      if (tracking) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) return; // só o gesto descendente
      // Gesto predominantemente HORIZONTAL não é pull-to-refresh — é o
      // carrossel de fotos (scroll-snap) ou qualquer scroller lateral.
      // Todo swipe de dedão deriva alguns px pra baixo; cancelar aqui
      // matava o arrasto do carrossel no app instalado (2026-09-02). O
      // próprio SwipeRefreshLayout também ignora gesto horizontal, então
      // deixar passar não re-arma o reload.
      if (Math.abs(e.touches[0].clientX - startX) > dy) return;
      // Documento REALMENTE rolado (páginas fora do shell, ex.: /admin):
      // arrastar pra voltar ao topo é legítimo — o pin re-prende no fim.
      if (window.scrollY > PIN_PX) return;
      if (hasScrollableUpAncestor(e.target)) return;
      if (e.cancelable) e.preventDefault();
    };
    const onTouchEnd = () => {
      tracking = false;
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
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', pin);
      window.removeEventListener('resize', pin);
      window.removeEventListener('pageshow', pin);
      document.removeEventListener('visibilitychange', pin);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      body.style.minHeight = prevMinHeight;
    };
  }, []);
}
