// @vitest-environment jsdom
//
// Trava do pull-to-refresh NATIVO do wrapper Android (2026-08-28). O
// SwipeRefreshLayout do AAB consulta o scroll do DOCUMENTO via
// canChildScrollUp(); o hook prende o documento em scrollY=1 pra resposta
// virar "pode subir" e o reload nunca armar. Aqui cobrimos: o matcher de
// user-agent, o pin inicial, o re-pin quando algo devolve o scroll a 0, o
// escopo (só WebView Android) e a limpeza no unmount.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import {
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

describe('isAndroidWebView', () => {
  it('reconhece o token "; wv)" do System WebView', () => {
    expect(isAndroidWebView(UA_WEBVIEW)).toBe(true);
    expect(isAndroidWebView(UA_WEBVIEW_REDUCED)).toBe(true);
  });

  it('reconhece geradores que anexam o próprio nome', () => {
    expect(isAndroidWebView(UA_CHROME_ANDROID + ' WebIntoApp')).toBe(true);
  });

  it('NÃO dispara no Chrome Android (site/PWA), iOS ou desktop', () => {
    expect(isAndroidWebView(UA_CHROME_ANDROID)).toBe(false);
    expect(isAndroidWebView(UA_IOS_SAFARI)).toBe(false);
    expect(isAndroidWebView(UA_DESKTOP)).toBe(false);
    expect(isAndroidWebView('')).toBe(false);
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
    setScrollY(0);
    document.body.style.minHeight = '';
  });

  afterEach(() => {
    // Sem vitest globals o auto-cleanup do testing-library não registra:
    // desmontar na mão, senão os listeners de um teste vazam pro seguinte.
    cleanup();
    vi.unstubAllGlobals();
  });

  it('no WebView: estica o body e prende o documento em scrollY=1', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    expect(document.body.style.minHeight).toBe('calc(100vh + 2px)');
    expect(scrollTo).toHaveBeenCalledWith(0, 1);
  });

  it('re-pina quando algo devolve o documento ao topo', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    scrollTo.mockClear();
    setScrollY(0);
    window.dispatchEvent(new Event('scroll'));
    expect(scrollTo).toHaveBeenCalledWith(0, 1);
  });

  it('já pinado (scrollY=1), não fica chamando scrollTo em loop', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    scrollTo.mockClear();
    setScrollY(1);
    window.dispatchEvent(new Event('scroll'));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('re-pina na retomada do WebView (pageshow) e no resize do teclado', () => {
    setUserAgent(UA_WEBVIEW);
    renderHook(() => useAndroidWebViewScrollPin());
    scrollTo.mockClear();
    setScrollY(0);
    window.dispatchEvent(new Event('pageshow'));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('resize'));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('fora do WebView Android é no-op total', () => {
    setUserAgent(UA_CHROME_ANDROID);
    renderHook(() => useAndroidWebViewScrollPin());
    expect(document.body.style.minHeight).toBe('');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('unmount restaura o body e solta os listeners', () => {
    setUserAgent(UA_WEBVIEW);
    const { unmount } = renderHook(() => useAndroidWebViewScrollPin());
    unmount();
    expect(document.body.style.minHeight).toBe('');
    scrollTo.mockClear();
    setScrollY(0);
    window.dispatchEvent(new Event('scroll'));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
