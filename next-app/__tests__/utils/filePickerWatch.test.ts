// @vitest-environment jsdom
//
// filePickerWatch — sobraram aqui `watchAppLeave` (o `openInBrowser` usa pra
// saber se o `intent:` realmente abriu o Chrome) e `ehAndroid`.
//
// O `watchFilePicker` e seus testes saíram em 2026-09-05. Aquele relógio
// tentava adivinhar "o seletor não abriu" e, na casca Capacitor — que
// implementa `onShowFileChooser` —, só produzia FALSO POSITIVO: a folha "A
// galeria não abriu" aparecia por cima da galeria aberta. Aviso errado ensina
// a pessoa a ignorar o aviso certo, então ele foi removido junto com a folha.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ehAndroid, watchAppLeave } from '../../lib/utils/filePickerWatch';

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A155M) AppleWebKit/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
// O UA REAL da casca: Dalvik, sem token `wv` e sem "Chrome". Um gate estrito
// de WebView ficaria mudo nele — por isso o teste é `/Android/i`.
const UA_CASCA = 'Dalvik/2.1.0 (Linux; U; Android 16; SM-A155M Build/UP1A)';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ehAndroid', () => {
  it('pega o UA da casca, que não parece WebView', () => {
    expect(ehAndroid(UA_CASCA)).toBe(true);
    expect(ehAndroid(UA_ANDROID)).toBe(true);
  });

  it('não pega iPhone nem vazio', () => {
    expect(ehAndroid(UA_IPHONE)).toBe(false);
    expect(ehAndroid('')).toBe(false);
  });
});

describe('watchAppLeave', () => {
  it('avisa quando a página NÃO saiu do ar no prazo', () => {
    // É o que diz ao openInBrowser que o `intent:` não abriu o Chrome, e
    // que o plano B (copiar o link) precisa entrar.
    const naoSaiu = vi.fn();
    watchAppLeave(naoSaiu, { timeoutMs: 500 });
    vi.advanceTimersByTime(500);
    expect(naoSaiu).toHaveBeenCalledTimes(1);
  });

  it('CALA quando a página perde o foco — o outro app abriu', () => {
    const naoSaiu = vi.fn();
    watchAppLeave(naoSaiu, { timeoutMs: 500 });
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(1000);
    expect(naoSaiu).not.toHaveBeenCalled();
  });

  it('CALA quando a aba fica oculta — mesmo sinal, outro evento', () => {
    // Nem toda WebView dispara `blur` ao abrir outra activity; por isso os
    // dois eventos, e não só um.
    const naoSaiu = vi.fn();
    watchAppLeave(naoSaiu, { timeoutMs: 500 });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(1000);
    expect(naoSaiu).not.toHaveBeenCalled();
  });

  it('CALA quando o chamador cancela', () => {
    const naoSaiu = vi.fn();
    const cancelar = watchAppLeave(naoSaiu, { timeoutMs: 500 });
    cancelar();
    vi.advanceTimersByTime(1000);
    expect(naoSaiu).not.toHaveBeenCalled();
  });

  it('cancelar duas vezes não quebra', () => {
    const cancelar = watchAppLeave(vi.fn(), { timeoutMs: 500 });
    cancelar();
    expect(() => cancelar()).not.toThrow();
  });
});
