// haptics.ts — vibração tátil curta pra dar sensação de app nativo.
//
// Plugin 'Haptics' da casca; fora dela cai no `navigator.vibrate` (Android
// Chrome/WebView suportam) e, na falta dos dois, é no-op silencioso. NUNCA
// lança — feedback tátil é enfeite, jamais pode quebrar a ação que o disparou.

import { getPlugin, isNativePlatform } from './platform';

type ImpactStyle = 'light' | 'medium' | 'heavy';
type NotifyType = 'success' | 'warning' | 'error';

interface HapticsPlugin {
  impact?: (opts: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void>;
  notification?: (opts: {
    type: 'SUCCESS' | 'WARNING' | 'ERROR';
  }) => Promise<void>;
  selectionStart?: () => Promise<void>;
  selectionChanged?: () => Promise<void>;
  selectionEnd?: () => Promise<void>;
}

function webVibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // alguns aparelhos exigem gesto ou têm a API desligada — ignora.
  }
}

/** Toque leve — curtir, salvar, selecionar, trocar aba. */
export function hapticImpact(style: ImpactStyle = 'light'): void {
  const plugin = getPlugin<HapticsPlugin>('Haptics');
  if (isNativePlatform() && plugin?.impact) {
    plugin
      .impact({ style: style.toUpperCase() as 'LIGHT' | 'MEDIUM' | 'HEAVY' })
      .catch(() => {});
    return;
  }
  webVibrate(style === 'heavy' ? 30 : style === 'medium' ? 18 : 10);
}

/** Feedback de conclusão — publicar, enviar orçamento, salvar com sucesso. */
export function hapticNotify(type: NotifyType = 'success'): void {
  const plugin = getPlugin<HapticsPlugin>('Haptics');
  if (isNativePlatform() && plugin?.notification) {
    plugin
      .notification({ type: type.toUpperCase() as 'SUCCESS' | 'WARNING' | 'ERROR' })
      .catch(() => {});
    return;
  }
  webVibrate(type === 'error' ? [12, 40, 12] : 15);
}

/** Mudança de seleção — trocar de aba, alternar toggle. */
export function hapticSelection(): void {
  const plugin = getPlugin<HapticsPlugin>('Haptics');
  if (isNativePlatform() && plugin?.selectionChanged) {
    plugin.selectionChanged().catch(() => {});
    return;
  }
  webVibrate(8);
}
