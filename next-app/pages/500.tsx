// pages/500.tsx — a tela de erro do SERVIDOR, agora nossa.
//
// Motivo (2026-09-01): o relato foi "deixo o app aberto, apago a tela do
// celular, abro de novo e vem 500 — e fica assim ATÉ REINICIAR O APP".
//
// O mecanismo: com a tela apagada o Android mata o processo do RENDERIZADOR
// da WebView (não o app inteiro). Ao voltar, a WebView precisa recriar o
// renderizador e RE-NAVEGAR pra URL atual. Se essa navegação pega um soluço
// do edge, a resposta é 500 — e aí vinha a página interna do Next,
// "500 | Server Error", que não tem UMA LINHA de JavaScript nosso: nem
// service worker, nem boundary do React, nem retry. Uma lápide. Por isso
// só saía reiniciando o app: nada mais navegava.
//
// Esta página substitui aquela. Ela se recupera sozinha.
//
// Duas decisões que valem explicação:
//
//   1. O retry é um <script> INLINE, não um `useEffect`. Se a pessoa está
//      vendo esta página, o servidor acabou de falhar — apostar que os
//      chunks de JS vão baixar e hidratar pra só então tentar de novo é
//      apostar justamente no que está quebrado. Inline roda no parse.
//
//   2. Vive em `pages/` (Pages Router) mesmo o app sendo App Router. Não é
//      descuido: `app/error.tsx` e `app/global-error.tsx` só pegam erro de
//      RENDER do React. Falha ABAIXO disso — carga de módulo, roteamento,
//      soluço da function no edge — nunca chega neles, e é exatamente essa
//      a que produz esta tela. `pages/500` é o único ponto de override.
//
// O freio é o mesmo de `lib/utils/autoRetry.ts` e da página "Reconectando…"
// do service worker: 2,5s + n·1,5s, no máximo 6 tentativas em 2 minutos,
// e reload imediato quando a internet voltar. Sem teto, falha permanente
// vira laço infinito de reload — gasta bateria e nunca mostra o erro.

const RETRY = `(function () {
  var CHAVE = 'qucAutoRetry';
  var MAX = 6, JANELA = 120000, BASE = 2500, PASSO = 1500;
  var agora = Date.now();
  var st = { n: 0, t: agora };
  try {
    var cru = sessionStorage.getItem(CHAVE);
    var lido = cru ? JSON.parse(cru) : null;
    if (lido && typeof lido.n === 'number' && agora - lido.t <= JANELA) st = lido;
  } catch (e) {}
  var recarregar = function () { location.reload(); };
  if (st.n >= MAX) {
    var aviso = document.getElementById('qm-status');
    if (aviso) {
      aviso.textContent =
        'Não consegui abrir depois de várias tentativas. Toque no botão pra tentar de novo.';
    }
    var titulo = document.getElementById('qm-titulo');
    if (titulo) titulo.textContent = 'QueroUmaCor';
    return;
  }
  st.n += 1;
  try { sessionStorage.setItem(CHAVE, JSON.stringify(st)); } catch (e) {}
  setTimeout(recarregar, BASE + st.n * PASSO);
  window.addEventListener('online', recarregar, { once: true });
})();`;

export default function ServerError() {
  return (
    <div
      style={{
        margin: 0,
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fdfbf7',
        color: '#1a1a2e',
        font: '400 15px/1.6 system-ui, -apple-system, sans-serif',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div>
        <div style={{ fontSize: 44, marginBottom: 12 }} aria-hidden="true">
          📶
        </div>
        <h1 id="qm-titulo" style={{ fontSize: 19, margin: '0 0 8px' }}>
          Reconectando…
        </h1>
        <p id="qm-status" style={{ margin: '0 0 20px', color: '#6b6b7b', maxWidth: 280 }}>
          O app teve uma instabilidade ao voltar. Vou tentar de novo sozinho em
          instantes — não precisa fechar nada.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            border: 0,
            borderRadius: 10,
            background: '#ff6b35',
            color: '#fff',
            font: '700 15px system-ui',
            padding: '12px 26px',
          }}
        >
          Tentar agora
        </button>
      </div>
      {/* Inline de propósito — ver o comentário no topo do arquivo. */}
      <script dangerouslySetInnerHTML={{ __html: RETRY }} />
    </div>
  );
}
