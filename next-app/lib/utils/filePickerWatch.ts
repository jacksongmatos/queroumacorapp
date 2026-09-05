// filePickerWatch — sobrou daqui a detecção de SAÍDA do app (`watchAppLeave`),
// usada pelo `openInBrowser` pra saber se o intent realmente abriu o Chrome.
//
// O `watchFilePicker` — que tentava adivinhar "o seletor não abriu" por um
// relógio — foi REMOVIDO em 2026-09-05. Ele existia pela WebView do wrapper
// antigo, que não implementava `onShowFileChooser`; a casca Capacitor
// implementa, e o seletor abre. O que restava era falso positivo: o aviso
// aparecia por cima da galeria aberta, ensinando a ignorar aviso.
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

/**
 * Só o Android tem o problema — e o wrapper pode mascarar o UA, por isso o
 * gate é largo (`/Android/i`) em vez de procurar o token `wv`.
 *
 * Exportado porque o `pickerRecovery` precisa do MESMO gate: se os dois
 * divergirem, uma tela arma a marca de recuperação e a outra não a limpa.
 */
export function ehAndroid(ua: string): boolean {
  return /Android/i.test(ua || '');
}

/**
 * Quanto esperar antes de concluir que o seletor não abriu.
 *
 * Era 1,8s até 2026-09-01, quando ficou provado que o seletor do wrapper é
 * um DIÁLOGO do próprio app ("Files Chooser": Camera × Files) — e diálogo
 * não tira o foco da página. O relógio estourava enquanto a pessoa ainda
 * lia as duas opções, e ela via "A galeria não abriu" logo antes de a
 * galeria abrir. Avisar cedo demais custa mais que avisar tarde: o aviso
 * errado ensina a pessoa a ignorar o certo.
 */
export const PADRAO_ESPERA_MS = 8000;

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
  }, opts?.timeoutMs ?? PADRAO_ESPERA_MS);
  window.addEventListener('blur', cancelar, { once: true });
  document.addEventListener('visibilitychange', cancelar, { once: true });
  return cancelar;
}
