// @vitest-environment jsdom
//
// Trava do pull-to-refresh NATIVO do wrapper Android (2026-08-28). O
// SwipeRefreshLayout do AAB consulta o scroll do DOCUMENTO via
// canChildScrollUp(); o hook prende o documento em scrollY=2 pra resposta
// virar "pode subir" e o reload nunca armar. Aqui cobrimos: o matcher de
// user-agent, o pin inicial, o re-pin quando algo devolve o scroll a 0
// (inclusive visibilitychange, retomada do WebView), a guarda de dreno
// (touchmove descendente fora de scroller não pode drenar o pin), o escopo
// (só WebView Android) e a limpeza no unmount.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import {
  isAndroid,
  isAndroidWebView,
  useAndroidWebViewScrollPin,
} from '@/lib/hooks/useAndroidWebViewScrollPin';

const UA_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36';
const UA_WEBVIEW_REDUCED =
  'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36';
const UA_CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const UA_IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

describe('isAndroid (gate do pin)', () => {
  it('casa qualquer Android — WebView, Chrome ou UA customizado do gerador', () => {
    expect(isAndroid(UA_WEBVIEW)).toBe(true);
    expect(isAndroid(UA_CHROME_ANDROID)).toBe(true);
    expect(isAndroid('MeuApp/1.0 (Android 14)')).toBe(true);
  });

  it('NÃO casa iOS, desktop ou UA vazio', () => {
    expect(isAndroid(UA_IOS_SAFARI)).toBe(false);
    expect(isAndroid(UA_DESKTOP)).toBe(false);
    expect(isAndroid('')).toBe(false);
  });
});

describe('isAndroidWebView (flag de diagnóstico)', () => {
  it('reconhece o token "; wv)" do System WebView', () => {
    expect(isAndroidWebView(UA_WEBVIEW)).toBe(true);
    expect(isAndroidWebView(UA_WEBVIEW_REDUCED)).toBe(true);
  });

  it('reconhece geradores que anexam o próprio nome', () => {
    expect(isAndroidWebView(UA_CHROME_ANDROID + ' WebIntoApp')).toBe(true);
  });

  it('NÃO marca Chrome Android (site/PWA), iOS ou desktop', () => {
    expect(isAndroidWebView(UA_CHROME_ANDROID)).toBe(false);
    expect(isAndroidWebView(UA_IOS_SAFARI)).toBe(false);
    expect(isAndroidWebView(UA_DESKTOP)).toBe(false);
  });

  it('exige Android — "wv" solto em outro OS não conta', () => {
    expect(isAndroidWebView('Mozilla/5.0 (X11; Linux; wv) Chrome/125')).toBe(false);
  });
});

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

function touch(type: string, clientY: number, target?: Element): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', {
    value: type === 'touchend' ? [] : [{ clientY }],
  });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

/** Dispara touchstart→touchmove no document e diz se o move foi cancelado. */
function swipeDoc(fromY: number, toY: number, target: Element): boolean {
  target.dispatchEvent(touch('touchstart', fromY, target));
  const move = touch('touchmove', toY, target);
  target.dispatchEvent(move);
  return move.defaultPrevented;
}

describe('useAndroidWebViewScrollPin', () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // jsdom não implementa scroll de verdade: scrollTo vira spy e scrollY é
    // redefinido na mão em cada cenário.
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    // rAF síncrono pra não depender de timing do jsdom.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // Ping de diagnóstico não pode bater na rede em teste.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))));
    sessionStorage.clear();
    setScrollY(0);
    document.body.style.minHeight = '';
  });

  afterEach(() => {
    // Sem vitest globals o auto-cleanup do testing-library não registra:
    // desmontar na mão, senão os listeners de um teste vazam pro seguinte.
    cleanup();
    vi.unstubAllGlobals();
  });

  it('no WebView: estica o body e prende o documento em scrollY=2', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    // dvh onde o CSSOM aceita, vh como fallback — os dois valem.
    expect(document.body.style.minHeight).toMatch(/^calc\(100d?vh \+ 4px\)$/);
    expect(scrollTo).toHaveBeenCalledWith(0, 2);
  });

  it('no Chrome Android (UA sem wv) TAMBÉM pina — gate é qualquer Android', () => {
    // Cobre o wrapper com user-agent customizado (sem token wv) e, de
    // quebra, mata o pull-to-refresh do próprio Chrome.
    setUserAgent(UA_CHROME_ANDROID);
    renderHook(() => useAndroidWebViewScrollPin());
    expect(document.body.style.minHeight).toMatch(/^calc\(100d?vh \+ 4px\)$/);
    expect(scrollTo).toHaveBeenCalledWith(0, 2);
  });

  it('re-pina quando algo devolve o documento ao topo', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    scrollTo.mockClear();
    setScrollY(0);
    window.dispatchEvent(new Event('scroll'));
    expect(scrollTo).toHaveBeenCalledWith(0, 2);
  });

  it('já pinado (scrollY=2), não fica chamando scrollTo em loop', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    scrollTo.mockClear();
    setScrollY(2);
    window.dispatchEvent(new Event('scroll'));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('re-pina na retomada do WebView (pageshow/visibilitychange) e no resize', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    scrollTo.mockClear();
    setScrollY(0);
    window.dispatchEvent(new Event('pageshow'));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('resize'));
    expect(scrollTo).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scrollTo).toHaveBeenCalledTimes(3);
  });

  it('fora do Android (iOS/desktop) é no-op total', () => {
    setUserAgent(UA_IOS_SAFARI);
    renderHook(() => useAndroidWebViewScrollPin());
    expect(document.body.style.minHeight).toBe('');
    expect(scrollTo).not.toHaveBeenCalled();
    // Guarda de dreno também não instala.
    expect(swipeDoc(100, 180, document.body)).toBe(false);
  });

  it('agenda o ping de diagnóstico e o cancela no unmount sem disparar', () => {
    vi.useFakeTimers();
    try {
      setUserAgent(UA_WEBVIEW);
      const { unmount } = renderHook(() => useAndroidWebViewScrollPin());
      vi.advanceTimersByTime(3000);
      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.type).toBe('scrollpin-diag');
      expect(body.msg).toContain('wv=true');
      // 1 por sessão: remontar não re-envia (sessionStorage guarda).
      unmount();
      renderHook(() => useAndroidWebViewScrollPin());
      vi.advanceTimersByTime(3000);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('unmount restaura o body (inclusive valor pré-existente) e solta os listeners', () => {
    setUserAgent(UA_WEBVIEW);
    document.body.style.minHeight = '50px';
    const { unmount } = renderHook(() => useAndroidWebViewScrollPin());
    expect(document.body.style.minHeight).toMatch(/^calc\(100d?vh \+ 4px\)$/);
    unmount();
    expect(document.body.style.minHeight).toBe('50px');
    scrollTo.mockClear();
    setScrollY(0);
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(swipeDoc(100, 180, document.body)).toBe(false);
    document.body.style.minHeight = '';
  });

  describe('guarda de dreno (touchmove no document)', () => {
    it('cancela o arrasto descendente que nasce fora de qualquer scroller', () => {
      // Simula o toque no TopNav / tela fora do AppShell: nada na cadeia
      // pode subir, então deixar rolar drenaria o pin 2→0 e re-armaria o
      // SwipeRefreshLayout no meio do gesto.
      setUserAgent(UA_WEBVIEW);
      renderHook(() => useAndroidWebViewScrollPin());
      setScrollY(2);
      expect(swipeDoc(100, 180, document.body)).toBe(true);
    });

    it('deixa passar quando um scroller na cadeia ainda pode subir', () => {
      setUserAgent(UA_WEBVIEW);
      const inner = document.createElement('div');
      inner.style.overflowY = 'auto';
      Object.defineProperty(inner, 'scrollTop', { value: 120, configurable: true });
      document.body.appendChild(inner);
      renderHook(() => useAndroidWebViewScrollPin());
      setScrollY(2);
      expect(swipeDoc(100, 180, inner)).toBe(false);
      inner.remove();
    });

    it('deixa passar o arrasto pra cima (rolar conteúdo pra baixo)', () => {
      setUserAgent(UA_WEBVIEW);
      renderHook(() => useAndroidWebViewScrollPin());
      setScrollY(2);
      expect(swipeDoc(180, 100, document.body)).toBe(false);
    });

    it('deixa passar quando o documento está realmente rolado (fora do shell)', () => {
      // /admin e afins rolam o documento: voltar ao topo é gesto legítimo.
      setUserAgent(UA_WEBVIEW);
      renderHook(() => useAndroidWebViewScrollPin());
      setScrollY(240);
      expect(swipeDoc(100, 180, document.body)).toBe(false);
    });

    it('ignora multi-toque (pinch não é rolagem)', () => {
      setUserAgent(UA_WEBVIEW);
      renderHook(() => useAndroidWebViewScrollPin());
      setScrollY(2);
      const start = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(start, 'touches', { value: [{ clientY: 100 }, { clientY: 300 }] });
      document.body.dispatchEvent(start);
      const move = touch('touchmove', 180, document.body);
      document.body.dispatchEvent(move);
      expect(move.defaultPrevented).toBe(false);
    });
  });
});
