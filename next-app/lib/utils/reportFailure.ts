// reportFailure — manda pro `/api/log-error` uma falha que o usuário JÁ
// está vendo na tela.
//
// Motivo (2026-08-29): um pintor reportou que não conseguia trocar a foto
// nem publicar portfólio. A tabela `errors` estava vazia pra ele — e eu
// li isso como "não houve falha". Estava errado: erro CAPTURADO (o catch
// do upload, o `error` da mutation) vira faixa vermelha na tela e MORRE
// ali. Só erro não capturado chega no `/api/log-error`. Ou seja, a tabela
// vazia não dizia nada sobre esses fluxos.
//
// Agora as duas mãos que mais falham em celular (subir foto de perfil e
// publicar post) avisam o servidor, com o `user_id`. Assim dá pra ver em
// `/admin/errors` o que a pessoa viu, sem depender dela transcrever a
// mensagem.
//
// Best-effort de verdade: nunca lança, nunca espera. Se o log falhar, o
// usuário nem fica sabendo — ele já tem o erro na tela.

/** Tipos usados hoje. `type` do schema tem teto de 32 chars. */
export type FailureType =
  | 'publish-fail'
  | 'avatar-fail'
  | 'picker-fail'
  | 'pdf-link-fail';

export function reportFailure(
  type: FailureType,
  err: unknown,
  opts?: { userId?: string | null; ctx?: string },
): void {
  if (typeof window === 'undefined') return;
  try {
    const e = err as { message?: string; name?: string; stack?: string } | null;
    const msg = (e?.message || String(err) || 'erro sem mensagem').slice(0, 1000);
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        user_id: opts?.userId || null,
        msg: `${e?.name ? e.name + ': ' : ''}${msg}`,
        stack: e?.stack ? String(e.stack).slice(0, 5000) : undefined,
        ua: navigator.userAgent?.slice(0, 500),
        url: location.href.slice(0, 500),
        ctx: opts?.ctx?.slice(0, 500),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logar nunca pode custar nada a quem já está com problema */
  }
}
