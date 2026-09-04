// browser.ts — abrir link EXTERNO. Na casca usa o plugin 'Browser' (Custom Tab
// / SafariViewController) em vez de navegar a própria WebView pra fora (o que
// tiraria a pessoa do app e, no iOS App-Bound Domains, seria bloqueado). Fora
// da casca abre em nova aba. Retorna true se algum caminho abriu.
//
// Só pra links EXTERNOS (site de fornecedor, ajuda, redes). Navegação interna
// do app continua sendo <Link>/router.

import { getPlugin, isNativePlatform } from './platform';

interface BrowserPlugin {
  open?: (opts: { url: string }) => Promise<void>;
}

export async function openExternal(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false; // só http(s) externo.
  const plugin = getPlugin<BrowserPlugin>('Browser');
  if (isNativePlatform() && plugin?.open) {
    try {
      await plugin.open({ url });
      return true;
    } catch {
      // cai pro window.open.
    }
  }
  try {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
