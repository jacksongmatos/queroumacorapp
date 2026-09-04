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
  routeFromNotificationData,
  shareNative,
  NATIVE_OAUTH_REDIRECT,
  hapticImpact,
  hapticNotify,
  hapticSelection,
  applyStatusBar,
  hideSplash,
  initKeyboard,
  onAppResume,
  isNativePickerAvailable,
  pickImagesNative,
  isNativeFilesystemAvailable,
  saveFileNative,
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

describe('routeFromNotificationData (toque na push → rota)', () => {
  it('aceita path relativo do data.url', () => {
    expect(routeFromNotificationData({ url: '/chat' })).toBe('/chat');
    expect(routeFromNotificationData({ url: '/perfil/abc' })).toBe('/perfil/abc');
  });
  it('recusa URL externa / protocol-relative (anti open-redirect)', () => {
    expect(routeFromNotificationData({ url: 'https://evil.com' })).toBeNull();
    expect(routeFromNotificationData({ url: '//evil.com' })).toBeNull();
    expect(routeFromNotificationData({ url: 'javascript:alert(1)' })).toBeNull();
  });
  it('sem url / tipo errado → null', () => {
    expect(routeFromNotificationData(undefined)).toBeNull();
    expect(routeFromNotificationData({})).toBeNull();
    expect(routeFromNotificationData({ url: 42 as unknown as string })).toBeNull();
  });
});

describe('lib/native Onda A — chrome/haptics fora da casca (no-op, nunca throw)', () => {
  it('haptics não lançam sem Capacitor', () => {
    expect(() => hapticImpact('light')).not.toThrow();
    expect(() => hapticNotify('success')).not.toThrow();
    expect(() => hapticSelection()).not.toThrow();
  });
  it('statusBar/keyboard/splash são no-op silencioso', () => {
    expect(() => applyStatusBar({ iconsLight: true })).not.toThrow();
    expect(() => initKeyboard()).not.toThrow();
    expect(() => hideSplash()).not.toThrow();
  });
  it('onAppResume devolve unsubscribe no-op fora da casca', () => {
    const off = onAppResume(() => {});
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });
});

describe('lib/native Onda A — dentro da casca', () => {
  it('haptics chamam o plugin Haptics', () => {
    const calls: string[] = [];
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        Haptics: {
          impact: async () => { calls.push('impact'); },
          notification: async () => { calls.push('notification'); },
          selectionChanged: async () => { calls.push('selection'); },
        },
      },
    });
    hapticImpact('medium');
    hapticNotify('success');
    hapticSelection();
    expect(calls).toEqual(['impact', 'notification', 'selection']);
  });

  it('applyStatusBar usa o plugin StatusBar', () => {
    let styled = false;
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        StatusBar: {
          setStyle: async () => { styled = true; },
          setBackgroundColor: async () => {},
          setOverlaysWebView: async () => {},
        },
      },
    });
    applyStatusBar({ iconsLight: true });
    expect(styled).toBe(true);
  });

  it('onAppResume registra listener no plugin App e a limpeza remove', async () => {
    let removed = false;
    let handler: ((d: unknown) => void) | undefined;
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        App: {
          addListener: (_e: string, cb: (d: unknown) => void) => {
            handler = cb;
            return { remove() { removed = true; } };
          },
        },
      },
    });
    let resumes = 0;
    const off = onAppResume(() => { resumes += 1; });
    handler?.({ isActive: true });
    handler?.({ isActive: false }); // background — não conta
    expect(resumes).toBe(1);
    off();
    expect(removed).toBe(true);
  });
});

describe('lib/native Onda B — picker + filesystem fora da casca', () => {
  it('picker/filesystem indisponíveis e helpers devolvem unavailable', async () => {
    expect(isNativePickerAvailable()).toBe(false);
    expect(isNativeFilesystemAvailable()).toBe(false);
    await expect(pickImagesNative(5)).resolves.toEqual({ status: 'unavailable' });
    await expect(saveFileNative('x.pdf', 'YQ==')).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('lib/native Onda B — dentro da casca', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('pickImagesNative baixa webPath e monta File[]', async () => {
    globalThis.fetch = (async () =>
      ({ blob: async () => new Blob(['xx'], { type: 'image/jpeg' }) })) as unknown as typeof fetch;
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        Camera: {
          getPhoto: async () => ({}),
          pickImages: async () => ({
            photos: [{ webPath: 'cap://a', format: 'jpg' }, { webPath: 'cap://b', format: 'jpg' }],
          }),
        },
      },
    });
    expect(isNativePickerAvailable()).toBe(true);
    const r = await pickImagesNative(5);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.files).toHaveLength(2);
      expect(r.files[0].type).toBe('image/jpeg');
    }
  });

  it('pickImagesNative sem escolha → cancelled', async () => {
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: { Camera: { getPhoto: async () => ({}), pickImages: async () => ({ photos: [] }) } },
    });
    await expect(pickImagesNative()).resolves.toEqual({ status: 'cancelled' });
  });

  it('saveFileNative grava via plugin Filesystem e devolve uri', async () => {
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        Filesystem: { writeFile: async () => ({ uri: 'file:///Documents/x.pdf' }) },
      },
    });
    expect(isNativeFilesystemAvailable()).toBe(true);
    const r = await saveFileNative('x.pdf', 'YQ==');
    expect(r).toEqual({ status: 'ok', uri: 'file:///Documents/x.pdf' });
  });
});
