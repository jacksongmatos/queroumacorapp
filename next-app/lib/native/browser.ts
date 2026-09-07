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

/**
 * Entrega uma URL EXTERNA ao sistema sem NUNCA navegar a WebView.
 *
 * POR QUE ISSO EXISTE (06/09/2026, rejeição da App Review na build 17):
 * dentro da casca, `window.location.href = <url de fora>` não "sai do app" —
 * o Capacitor vê uma navegação de topo pra um host fora de
 * `server.allowNavigation`, entrega a URL ao sistema E **cancela** a
 * navegação (`WebViewDelegationHandler.swift`). O cancelamento chega como
 * `didFailProvisionalNavigation`, e ali o Capacitor carrega a `errorPath` —
 * o nosso `offline.html`. A pessoa fica com "Sem conexão" em tela cheia, com
 * a internet funcionando.
 *
 * `window.open(url, '_blank')` passa por outro caminho (`createWebViewWith`),
 * que abre no sistema SEM cancelar navegação nenhuma. É o caminho seguro.
 *
 * PEGADINHA: nesse caminho o `window.open` devolve **null mesmo quando deu
 * certo** (o delegate abre no sistema e retorna `nil` pro WebKit). Por isso,
 * na casca, o retorno dele NÃO é lido — tratar null como falha faria o app
 * mostrar erro em cima de um link que abriu.
 *
 * Aceita qualquer esquema (https, mailto, tel), porque quem trata é o SO.
 */
export function abrirLinkExterno(url: string): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativePlatform()) {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true; // ver "PEGADINHA" acima: o null aqui não significa falha.
    } catch {
      return false;
    }
  }
  // Browser/PWA: aqui o null é falha de verdade (bloqueio de pop-up), e a
  // navegação de topo é o fallback correto — não há casca pra cancelar nada.
  try {
    if (window.open(url, '_blank', 'noopener,noreferrer')) return true;
  } catch {
    /* bloqueado — cai pra navegação */
  }
  try {
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}
