// @vitest-environment jsdom
// openInBrowser — a segunda saída de quem está preso no app empacotado.
// Dentro da WebView, `window.open` costuma abrir outra tela do MESMO app;
// quem manda pro Chrome de verdade é a URL `intent:`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirNoNavegador, intentUrl } from '../../lib/utils/openInBrowser';

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 16; SM-A155M) AppleWebKit/537.36';
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

let href = '';

beforeEach(() => {
  vi.useFakeTimers();
  href = '';
  // jsdom não navega; guardamos o que foi atribuído.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return href;
      },
      set href(v: string) {
        href = v;
      },
    },
  });
});
afterEach(() => vi.useRealTimers());

describe('intentUrl', () => {
  it('vira intent:// com esquema https e action VIEW', () => {
    expect(intentUrl('https://queroumacor.com.br/publicar')).toBe(
      'intent://queroumacor.com.br/publicar#Intent;scheme=https;action=android.intent.action.VIEW;end',
    );
  });
});

describe('abrirNoNavegador', () => {
  it('no Android navega pro intent:', () => {
    abrirNoNavegador('https://queroumacor.com.br/perfil/editar', { userAgent: UA_ANDROID });
    expect(href.startsWith('intent://')).toBe(true);
  });

  it('avisa quando NADA abriu — a página nem perdeu o foco', () => {
    const naoAbriu = vi.fn();
    abrirNoNavegador('https://queroumacor.com.br/publicar', {
      userAgent: UA_ANDROID,
      onNaoAbriu: naoAbriu,
    });
    expect(naoAbriu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(naoAbriu).toHaveBeenCalledTimes(1);
  });

  it('CALA quando o app saiu de cena — o navegador abriu', () => {
    const naoAbriu = vi.fn();
    abrirNoNavegador('https://queroumacor.com.br/publicar', {
      userAgent: UA_ANDROID,
      onNaoAbriu: naoAbriu,
    });
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(2500);
    expect(naoAbriu).not.toHaveBeenCalled();
  });

  it('fora do Android usa window.open, e o popup bloqueado conta como falha', () => {
    const naoAbriu = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    abrirNoNavegador('https://queroumacor.com.br/publicar', {
      userAgent: UA_DESKTOP,
      onNaoAbriu: naoAbriu,
    });
    expect(open).toHaveBeenCalled();
    expect(href).toBe('');
    expect(naoAbriu).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });
});
