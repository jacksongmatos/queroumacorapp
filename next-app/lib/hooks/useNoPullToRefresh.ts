// Trava o pull-to-refresh do navegador no scroller principal do app.
//
// Camada 2 da correção do "arrasto pra cima recarrega a página". A camada 1
// é CSS (`overscroll-behavior-y: contain` em html/body e no <main> — ver
// globals.css), que corta o ENCADEAMENTO do gesto do scroller interno pro
// scroller raiz. Ela cobre o caso de quem já estava rolando e chega no topo
// no meio do arrasto.
//
// O que o CSS não cobre com a mesma confiança é o gesto que NASCE no topo —
// e é justamente o que sobrou no relato ("se fizer muito rápido o movimento
// ele faz refresh"): quem arrasta rápido chega no topo, solta e arrasta de
// novo, e o segundo gesto começa em scrollTop 0. Aqui o toque é cancelado na
// origem: `preventDefault` num `touchmove` cancelável mata o gesto de
// recarregar do Chromium sem depender de nenhuma heurística do navegador.
//
// Só cancela quando NÃO HÁ NADA pra rolar pra cima — dedo descendo com o
// scroller no topo. Arrasto pra cima (rolar o feed pra baixo) e gesto
// horizontal passam intactos.
'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Sobe de `from` até `stopAt` procurando um scroller que ainda pode subir.
 *
 *  Sem isso, o guard congelaria os scrollers ANINHADOS (lista de mensagens do
 *  chat, corpo de bottom-sheet): eles vivem dentro do <main>, o touchmove
 *  deles borbulha até aqui, e cancelar o evento pararia um scroll legítimo
 *  só porque o <main> por acaso está no topo. */
function hasScrollableUpAncestor(from: EventTarget | null, stopAt: HTMLElement): boolean {
  let node = from instanceof Element ? from : null;
  while (node && node !== stopAt) {
    if (node instanceof HTMLElement && node.scrollTop > 0) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function useNoPullToRefresh(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      // Pinch/multi-toque não é rolagem — deixa o navegador cuidar.
      tracking = e.touches.length === 1;
      if (tracking) startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const movingDown = e.touches[0].clientY - startY > 0;
      if (!movingDown) return;
      if (el.scrollTop > 0) return;
      if (hasScrollableUpAncestor(e.target, el)) return;
      // `cancelable` fica false depois que o navegador já assumiu a rolagem;
      // chamar preventDefault aí só gera warning no console e não faz nada.
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      tracking = false;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref]);
}
