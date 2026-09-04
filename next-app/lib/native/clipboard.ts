// clipboard.ts — copiar texto (HEX de cor, link de perfil/produto, nº de
// orçamento). Plugin 'Clipboard' na casca; fora dela navigator.clipboard; e um
// último recurso com textarea + execCommand pra WebView velha sem nenhum dos
// dois. Retorna true se copiou.

import { getPlugin, isNativePlatform } from './platform';

interface ClipboardPlugin {
  write?: (opts: { string: string }) => Promise<void>;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // 1) Plugin nativo.
  const plugin = getPlugin<ClipboardPlugin>('Clipboard');
  if (isNativePlatform() && plugin?.write) {
    try {
      await plugin.write({ string: text });
      return true;
    } catch {
      // cai pro caminho web.
    }
  }
  // 2) Web Clipboard API (precisa de contexto seguro / gesto).
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai pro execCommand.
  }
  // 3) Último recurso: textarea escondida + execCommand('copy').
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
