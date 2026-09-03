// share.ts — share sheet nativo, com o Web Share API como fallback natural.
//
// Retorna true quando o compartilhamento foi ENTREGUE a alguma share sheet
// (nativa ou web). false = nenhum mecanismo disponível — o caller mostra o
// fallback manual de sempre (copiar link / botão WhatsApp).

import { getPlugin, isNativePlatform } from './platform';

interface SharePlugin {
  share: (opts: {
    title?: string;
    text?: string;
    url?: string;
  }) => Promise<unknown>;
}

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export async function shareNative(payload: SharePayload): Promise<boolean> {
  // 1º: share sheet da casca nativa.
  const plugin = getPlugin<SharePlugin>('Share');
  if (isNativePlatform() && plugin) {
    try {
      await plugin.share(payload);
      return true;
    } catch (e) {
      // Cancelamento do usuário conta como "entregue" (não cair pro fallback
      // e abrir OUTRO share em cima do cancelamento).
      const msg = e instanceof Error ? e.message : String(e);
      return /cancel/i.test(msg);
    }
  }
  // 2º: Web Share API (mobile browsers / PWA).
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(payload);
      return true;
    } catch {
      return true; // cancelamento — mesmo racional acima
    }
  }
  return false;
}
