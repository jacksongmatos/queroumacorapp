// device.ts — modelo/OS/versão do app, pra suporte e diagnóstico (/diag,
// relatórios de erro). Usa os plugins 'Device' e 'App'. Fora da casca devolve
// o que dá pra saber do navegador (userAgent) e null no resto.

import { getPlugin, isNativePlatform } from './platform';

interface DevicePlugin {
  getInfo?: () => Promise<{
    model?: string;
    platform?: string;
    operatingSystem?: string;
    osVersion?: string;
    manufacturer?: string;
  }>;
}
interface AppPlugin {
  getInfo?: () => Promise<{ version?: string; build?: string; id?: string }>;
}

export interface NativeDeviceInfo {
  isNative: boolean;
  platform: string;
  model: string | null;
  osVersion: string | null;
  appVersion: string | null;
  appBuild: string | null;
}

/** Coleta o que estiver disponível; nunca lança. */
export async function getDeviceInfo(): Promise<NativeDeviceInfo> {
  const base: NativeDeviceInfo = {
    isNative: isNativePlatform(),
    platform: isNativePlatform() ? 'native' : 'web',
    model: null,
    osVersion: null,
    appVersion: null,
    appBuild: null,
  };
  if (!isNativePlatform()) return base;
  try {
    const dev = getPlugin<DevicePlugin>('Device');
    const app = getPlugin<AppPlugin>('App');
    const [d, a] = await Promise.all([
      dev?.getInfo?.().catch(() => undefined),
      app?.getInfo?.().catch(() => undefined),
    ]);
    return {
      ...base,
      platform: d?.platform ?? base.platform,
      model: d?.model ?? null,
      osVersion: d?.osVersion ?? null,
      appVersion: a?.version ?? null,
      appBuild: a?.build ?? null,
    };
  } catch {
    return base;
  }
}
