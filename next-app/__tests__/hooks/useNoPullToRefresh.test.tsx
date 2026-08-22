// @vitest-environment jsdom
//
// Guard do pull-to-refresh (2026-08-22). O CSS `overscroll-behavior-y:
// contain` corta o encadeamento do gesto; este hook cobre o toque que NASCE
// com o scroller já no topo — o caso que sobrou no arrasto rápido.
//
// jsdom não tem TouchEvent, então os eventos são montados na mão: o hook só
// lê `touches[0].clientY`, `target` e `cancelable`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useNoPullToRefresh } from '@/lib/hooks/useNoPullToRefresh';

function touch(type: string, clientY: number, target?: Element): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', {
    value: type === 'touchend' ? [] : [{ clientY }],
  });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

/** Dispara o par touchstart→touchmove e diz se o movimento foi cancelado. */
function swipe(el: HTMLElement, fromY: number, toY: number, target: Element = el): boolean {
  el.dispatchEvent(touch('touchstart', fromY, target));
  const move = touch('touchmove', toY, target);
  el.dispatchEvent(move);
  return move.defaultPrevented;
}

let scroller: HTMLElement;

beforeEach(() => {
  scroller = document.createElement('main');
  // jsdom não faz layout: scrollTop é sempre 0 e read-only na prática, então
  // cada teste redefine o valor que o hook vai ler.
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
  document.body.appendChild(scroller);
});

afterEach(() => {
  scroller.remove();
});

function mount() {
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = scroller;
  renderHook(() => useNoPullToRefresh(ref));
  return ref;
}

describe('useNoPullToRefresh', () => {
  it('cancela o arrasto pra baixo com o scroller no topo', () => {
    mount();
    expect(swipe(scroller, 100, 180)).toBe(true);
  });

  it('não mexe no arrasto pra cima (rolar o feed pra baixo)', () => {
    mount();
    expect(swipe(scroller, 180, 100)).toBe(false);
  });

  it('não mexe no arrasto pra baixo quando ainda há o que rolar', () => {
    mount();
    (scroller as unknown as { scrollTop: number }).scrollTop = 240;
    expect(swipe(scroller, 100, 180)).toBe(false);
  });

  it('não congela scroller aninhado que ainda pode subir', () => {
    // Lista de mensagens do chat / corpo de bottom-sheet: vive dentro do
    // <main>, o touchmove borbulha até o guard. Cancelar aí pararia um
    // scroll legítimo só porque o <main> por acaso está no topo.
    const inner = document.createElement('div');
    inner.style.overflowY = 'auto';
    Object.defineProperty(inner, 'scrollTop', { value: 120, writable: true, configurable: true });
    scroller.appendChild(inner);
    mount();
    expect(swipe(scroller, 100, 180, inner)).toBe(false);
  });

  it('cancela quando o aninhado também já está no topo', () => {
    const inner = document.createElement('div');
    inner.style.overflowY = 'auto';
    Object.defineProperty(inner, 'scrollTop', { value: 0, writable: true, configurable: true });
    scroller.appendChild(inner);
    mount();
    expect(swipe(scroller, 100, 180, inner)).toBe(true);
  });

  it('ignora multi-toque (pinch não é rolagem)', () => {
    mount();
    const start = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'touches', { value: [{ clientY: 100 }, { clientY: 300 }] });
    scroller.dispatchEvent(start);
    const move = touch('touchmove', 180);
    scroller.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
  });

  it('solta os listeners no unmount', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = scroller;
    const { unmount } = renderHook(() => useNoPullToRefresh(ref));
    unmount();
    expect(swipe(scroller, 100, 180)).toBe(false);
  });
});
