// @vitest-environment jsdom
// filePickerWatch — o aviso só pode aparecer quando o seletor REALMENTE
// não abriu. Falso positivo aqui é pior que o silêncio: manda a pessoa
// pro navegador sem motivo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchFilePicker } from '../../lib/utils/filePickerWatch';

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A155M) AppleWebKit/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('watchFilePicker', () => {
  it('avisa quando NADA acontece — o seletor não abriu', () => {
    const avisou = vi.fn();
    watchFilePicker(avisou, { userAgent: UA_ANDROID, timeoutMs: 100 });
    expect(avisou).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(avisou).toHaveBeenCalledTimes(1);
  });

  it('CALA quando a página perde o foco — é o seletor abrindo', () => {
    const avisou = vi.fn();
    watchFilePicker(avisou, { userAgent: UA_ANDROID, timeoutMs: 100 });
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(500);
    expect(avisou).not.toHaveBeenCalled();
  });

  it('CALA quando a aba fica oculta — mesma coisa, outro sinal', () => {
    const avisou = vi.fn();
    watchFilePicker(avisou, { userAgent: UA_ANDROID, timeoutMs: 100 });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(500);
    expect(avisou).not.toHaveBeenCalled();
  });

  it('CALA quando o chamador cancela (o change disparou)', () => {
    const avisou = vi.fn();
    const cancelar = watchFilePicker(avisou, { userAgent: UA_ANDROID, timeoutMs: 100 });
    cancelar();
    vi.advanceTimersByTime(500);
    expect(avisou).not.toHaveBeenCalled();
  });

  it('nem arma fora do Android — o problema é só de lá', () => {
    const avisou = vi.fn();
    watchFilePicker(avisou, { userAgent: UA_IPHONE, timeoutMs: 100 });
    vi.advanceTimersByTime(500);
    expect(avisou).not.toHaveBeenCalled();
  });

  it('cancelar duas vezes não quebra', () => {
    const cancelar = watchFilePicker(() => {}, { userAgent: UA_ANDROID, timeoutMs: 100 });
    expect(() => { cancelar(); cancelar(); }).not.toThrow();
  });
});
