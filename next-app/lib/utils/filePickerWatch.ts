// filePickerWatch — descobre quando o seletor de arquivos NÃO abriu.
//
// Motivo (2026-08-29): no app empacotado (WebIntoApp), a WebView só abre a
// galeria se o wrapper implementar `onShowFileChooser` e declarar as
// permissões. Quando não implementa, tocar em "Trocar foto" ou em
// "Selecionar foto" não faz absolutamente NADA: nenhum erro, nenhum
// evento, nenhuma linha de log. O usuário toca, não acontece nada, e
// conclui que o app está quebrado — foi o que aconteceu com um pintor,
// que ficou sem trocar a foto e sem publicar portfólio.
//
// Não dá pra perguntar ao navegador "o seletor abriu?". O que dá pra
// observar é o efeito colateral: quando ele abre, a página PERDE o foco
// (o Android troca de activity) — dispara `blur` e/ou `visibilitychange`.
// Se em ~1,8s nada disso aconteceu, o seletor não abriu.
//
// Só arma no Android: em desktop e iOS o falso positivo é possível (o
// diálogo nativo nem sempre tira o foco da página) e o problema não
// existe lá.

/** Só o Android tem o problema — e o wrapper pode mascarar o UA. */
function ehAndroid(ua: string): boolean {
  return /Android/i.test(ua || '');
}

/**
 * "A página saiu do ar em até X ms?" — o tijolo por trás do
 * `watchFilePicker`, sem o filtro de Android.
 *
 * Serve pra qualquer coisa que DEVERIA tirar o foco da página: abrir o
 * seletor de arquivos, disparar um `intent:` de compartilhar, chamar outro
 * app. Se o foco não saiu, aquilo não aconteceu — e o chamador usa o plano
 * B. Devolve a função de cancelar.
 */
export function watchAppLeave(
  onNaoSaiu: () => void,
  opts?: { timeoutMs?: number },
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  let vivo = true;
  const cancelar = () => {
    if (!vivo) return;
    vivo = false;
    clearTimeout(timer);
    window.removeEventListener('blur', cancelar);
    document.removeEventListener('visibilitychange', cancelar);
  };
  const timer = setTimeout(() => {
    if (!vivo) return;
    cancelar();
    onNaoSaiu();
  }, opts?.timeoutMs ?? 1800);
  window.addEventListener('blur', cancelar, { once: true });
  document.addEventListener('visibilitychange', cancelar, { once: true });
  return cancelar;
}

/**
 * Chame no MESMO gesto que abre o seletor (o clique). Devolve uma função
 * pra cancelar manualmente, caso o chamador descubra por outro caminho
 * que deu certo (por exemplo, o `change` disparou).
 */
export function watchFilePicker(
  onNaoAbriu: () => void,
  opts?: { timeoutMs?: number; userAgent?: string },
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  const ua = opts?.userAgent ?? navigator.userAgent ?? '';
  if (!ehAndroid(ua)) return () => {};
  return watchAppLeave(onNaoAbriu, { timeoutMs: opts?.timeoutMs });
}

/** Texto único pros dois lugares que sofrem com isso. */
export const AVISO_SELETOR =
  'O app não conseguiu abrir a galeria. Abra o QueroUmaCor pelo navegador do celular (queroumacor.com.br) e tente por lá — pelo navegador funciona.';
