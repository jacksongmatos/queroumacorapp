// native.test.ts — trava o contrato da fronteira lib/native:
//   1. Fora da casca (sem window.Capacitor) TUDO reporta indisponível e os
//      helpers devolvem o valor de fallback — nunca throw. É a garantia de
//      que browser puro/PWA/casca velha continuam funcionando.
//   2. parseAuthCallbackUrl (pura) extrai tokens/erro do deep link do OAuth
//      — o coração do fluxo A; regressão aqui = login social quebrado no app.
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  isNativePlatform,
  getNativePlatform,
  isNativeOAuthAvailable,
  isNativeCameraAvailable,
  isNativePushAvailable,
  parseAuthCallbackUrl,
  takePhotoNative,
  registerNativePush,
  shareNative,
  NATIVE_OAUTH_REDIRECT,
} from '../lib/native';

type CapacitorMock = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

function setCapacitor(mock: CapacitorMock | undefined) {
  (window as unknown as { Capacitor?: CapacitorMock }).Capacitor = mock;
}

afterEach(() => {
  setCapacitor(undefined);
  // jsdom expõe navigator.share? Não por default — garantimos ausência.
});

describe('lib/native — fora da casca (browser puro)', () => {
  it('detecção reporta web/false em tudo', () => {
    expect(isNativePlatform()).toBe(false);
    expect(getNativePlatform()).toBe('web');
    expect(isNativeOAuthAvailable()).toBe(false);
    expect(isNativeCameraAvailable()).toBe(false);
    expect(isNativePushAvailable()).toBe(false);
  });

  it('helpers devolvem fallback, nunca throw', async () => {
    await expect(takePhotoNative()).resolves.toEqual({ status: 'unavailable' });
    await expect(registerNativePush()).resolves.toBeNull();
    await expect(shareNative({ url: 'https://x' })).resolves.toBe(false);
  });

  it('Capacitor presente mas isNativePlatform()=false (SDK carregado no browser) segue web', () => {
    setCapacitor({ isNativePlatform: () => false, getPlatform: () => 'web' });
    expect(isNativePlatform()).toBe(false);
    expect(getNativePlatform()).toBe('web');
  });
});

describe('lib/native — dentro da casca', () => {
  it('plataforma ios/android detectada', () => {
    setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'ios' });
    expect(isNativePlatform()).toBe(true);
    expect(getNativePlatform()).toBe('ios');
  });

  it('casca SEM os plugins de OAuth → indisponível (fallback web obrigatório)', () => {
    setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} });
    expect(isNativeOAuthAvailable()).toBe(false);
  });

  it('casca COM Browser+App → OAuth nativo disponível', () => {
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: { Browser: { open: async () => {} }, App: { addListener: () => ({ remove() {} }) } },
    });
    expect(isNativeOAuthAvailable()).toBe(true);
  });

  it('câmera nativa: cancelamento do usuário NÃO vira erro nem fallback', async () => {
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        Camera: {
          getPhoto: async () => {
            throw new Error('User cancelled photos app');
          },
        },
      },
    });
    await expect(takePhotoNative()).resolves.toEqual({ status: 'cancelled' });
  });

  it('câmera nativa: base64 vira File com mime/format corretos', async () => {
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        Camera: { getPhoto: async () => ({ base64String: btoa('fake-bytes'), format: 'png' }) },
      },
    });
    const res = await takePhotoNative('CAMERA');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.file.type).toBe('image/png');
      expect(res.file.size).toBeGreaterThan(0);
    }
  });
});

describe('parseAuthCallbackUrl', () => {
  it('extrai tokens do fragment (fluxo implicit do Supabase)', () => {
    const url = `${NATIVE_OAUTH_REDIRECT}#access_token=AT123&refresh_token=RT456&token_type=bearer`;
    expect(parseAuthCallbackUrl(url)).toEqual({
      accessToken: 'AT123',
      refreshToken: 'RT456',
    });
  });

  it('extrai erro (usuário negou no provedor)', () => {
    const url = `${NATIVE_OAUTH_REDIRECT}#error=access_denied&error_description=denied`;
    expect(parseAuthCallbackUrl(url).errorDescription).toBe('denied');
  });

  it('aceita query string além de fragment', () => {
    const url = `${NATIVE_OAUTH_REDIRECT}?access_token=A&refresh_token=R`;
    expect(parseAuthCallbackUrl(url)).toEqual({ accessToken: 'A', refreshToken: 'R' });
  });

  it('URL alheia (outro deep link) → objeto vazio, nunca throw', () => {
    expect(parseAuthCallbackUrl('br.com.queroumacor.app://outro/caminho#x=1')).toEqual({});
    expect(parseAuthCallbackUrl('https://queroumacor.com.br/#access_token=A')).toEqual({});
    expect(parseAuthCallbackUrl('')).toEqual({});
  });
});
