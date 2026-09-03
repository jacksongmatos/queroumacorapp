// lib/native — A ÚNICA fronteira do app web com a casca nativa (Capacitor).
//
// Contrato: componentes e hooks importam SÓ este módulo (objeto `native`),
// nunca plugin/global direto. Toda função aqui é feature-detected e tem
// fallback definido — a mesma página funciona em browser puro, PWA, casca
// Capacitor velha (sem o plugin) e casca nova. Se a casca um dia virar
// React Native/Expo, reimplementa-se este diretório e nada mais.
//
// Decisão de arquitetura registrada em docs/NATIVE_BRIDGE.md e na auditoria
// 2026-08-26 (achado A-P1 + análise Capacitor vs RN).

export {
  isNativePlatform,
  getNativePlatform,
} from './platform';
export {
  isNativeOAuthAvailable,
  nativeSignInWithOAuth,
  parseAuthCallbackUrl,
  NATIVE_OAUTH_REDIRECT,
} from './auth';
export { isNativeCameraAvailable, takePhotoNative } from './camera';
export type { NativePhotoResult } from './camera';
export { shareNative } from './share';
export type { SharePayload } from './share';
export {
  isNativePushAvailable,
  registerNativePush,
  initNativePushTapRouting,
  routeFromNotificationData,
} from './push';

import { getNativePlatform, isNativePlatform } from './platform';
import { isNativeOAuthAvailable, nativeSignInWithOAuth } from './auth';
import { isNativeCameraAvailable, takePhotoNative } from './camera';
import { shareNative } from './share';
import {
  isNativePushAvailable,
  registerNativePush,
  initNativePushTapRouting,
} from './push';

/** Fachada única — preferir `native.x()` nos call sites. */
export const native = {
  isNative: isNativePlatform,
  platform: getNativePlatform,
  oauth: { isAvailable: isNativeOAuthAvailable, signIn: nativeSignInWithOAuth },
  camera: { isAvailable: isNativeCameraAvailable, takePhoto: takePhotoNative },
  share: shareNative,
  push: {
    isAvailable: isNativePushAvailable,
    register: registerNativePush,
    initTapRouting: initNativePushTapRouting,
  },
};
