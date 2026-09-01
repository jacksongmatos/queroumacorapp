// pickerRecovery — sobrevive ao app ser MORTO enquanto a galeria está aberta.
//
// Motivo (2026-09-01): com o AAB de 31/08 a galeria finalmente ABRE (o
// wrapper passou a implementar `onShowFileChooser`). Só que apareceu o
// problema seguinte, relatado por um pintor: ele escolhe a foto e o app
// **volta pra tela inicial**, sem a foto e sem a legenda.
//
// Não é bug nosso e não dá pra impedir pelo lado web. O que acontece:
//   1. o seletor de fotos é OUTRA activity (Google Fotos / DocumentsUI),
//      e ela é pesada de memória — carrega milhares de miniaturas;
//   2. o QueroUmaCor fica em segundo plano e o Android ENCERRA o processo
//      pra liberar RAM (comportamento normal e documentado do sistema);
//   3. na volta, o wrapper recria a activity, a WebView nasce vazia e
//      carrega a URL INICIAL — por isso a pessoa cai no /feed;
//   4. o `ValueCallback` que receberia o arquivo morreu junto, então a
//      foto é descartada mesmo que a tela tivesse sobrevivido.
//
// A correção de raiz é do WebIntoApp (guardar `ValueCallback` +
// `WebView.saveState()` na recriação da activity — ver
// `docs/AAB_PROXIMA_VERSAO.md`). O que dá pra fazer AQUI é não deixar o
// pintor no escuro: deixamos uma marca em `localStorage` (que sobrevive
// à morte do processo, ao contrário do `sessionStorage`, que nasce vazio
// numa WebView nova) antes de abrir o seletor, e apagamos essa marca em
// TODOS os finais normais — o arquivo chegou, a pessoa cancelou, ou o
// seletor nem abriu.
//
// Sobrou marca num documento recém-carregado = aquele documento morreu
// com uma escolha pendente. Aí o app leva a pessoa de volta pra tela
// certa e explica o que houve, em vez de largá-la no feed achando que o
// app está quebrado.
//
// Só arma no Android: em iOS/desktop o processo não morre nessa troca, e
// marcar ali só criaria falso positivo.

import { ehAndroid, watchFilePicker } from './filePickerWatch';

const CHAVE = 'quc_pick_pendente_v1';

/**
 * Janela de validade da marca. Escolher uma foto leva segundos; se a
 * pessoa só voltou ao app horas depois, aquilo não é mais "o app morreu
 * no meio da escolha" — é sessão nova, e avisar seria mentira.
 */
export const JANELA_MS = 5 * 60 * 1000;

export interface EscolhaPendente {
  /** Rota pra onde voltar (ex.: '/publicar'). */
  rota: string;
  /** Qual tela armou — o dono da marca é quem consome (ver `consumir`). */
  ctx: string;
  /** Epoch ms de quando o seletor foi aberto. */
  em: number;
}

function temStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // WebView com dados de site bloqueados: só acessar já lança.
    return false;
  }
}

/** Grava a marca. Chamar no MESMO gesto que abre o seletor. */
export function marcarEscolhaPendente(
  rota: string,
  ctx: string,
  agora: number = Date.now(),
): void {
  if (!temStorage()) return;
  try {
    const dado: EscolhaPendente = { rota, ctx, em: agora };
    localStorage.setItem(CHAVE, JSON.stringify(dado));
  } catch {
    /* quota/privacidade não pode quebrar a seleção de foto */
  }
}

/** Apaga a marca. Idempotente. */
export function limparEscolhaPendente(): void {
  if (!temStorage()) return;
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}

/**
 * Lê a marca SEM apagar — quem apaga é a tela dona dela
 * (`consumirEscolhaPendente`). Marca fora da janela é descartada aqui
 * mesmo, pra não ficar sujeira eterna no aparelho.
 */
export function lerEscolhaPendente(
  agora: number = Date.now(),
): EscolhaPendente | null {
  if (!temStorage()) return null;
  let bruto: string | null;
  try {
    bruto = localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
  if (!bruto) return null;
  let dado: EscolhaPendente | null = null;
  try {
    dado = JSON.parse(bruto) as EscolhaPendente;
  } catch {
    limparEscolhaPendente();
    return null;
  }
  if (
    !dado ||
    typeof dado.rota !== 'string' ||
    typeof dado.ctx !== 'string' ||
    typeof dado.em !== 'number'
  ) {
    limparEscolhaPendente();
    return null;
  }
  if (agora - dado.em > JANELA_MS || agora < dado.em) {
    limparEscolhaPendente();
    return null;
  }
  return dado;
}

/**
 * Lê E apaga — mas só se a marca for DESTA tela. Sem o filtro por `ctx`,
 * a primeira tela a montar consumiria a marca de outra e a pessoa
 * receberia o aviso no lugar errado (ou aviso nenhum no lugar certo).
 */
export function consumirEscolhaPendente(
  ctx?: string,
  agora: number = Date.now(),
): EscolhaPendente | null {
  const dado = lerEscolhaPendente(agora);
  if (!dado) return null;
  if (ctx && dado.ctx !== ctx) return null;
  limparEscolhaPendente();
  return dado;
}

export interface ArmarSelecaoOpts {
  /** Rota pra onde voltar se o app morrer (ex.: '/perfil/editar'). */
  rota: string;
  /** Identifica a tela dona da marca (ex.: 'publicar'). */
  ctx: string;
  /** Chamado quando o seletor NÃO abriu (ver filePickerWatch). */
  onNaoAbriu: () => void;
  /**
   * Chamado quando o seletor abriu DEPOIS de já termos avisado que não
   * abriu — ou seja, o aviso foi falso positivo e a tela deve retirá-lo.
   *
   * Isso acontece de verdade (2026-09-01): o seletor do WebIntoApp é um
   * diálogo DO PRÓPRIO app ("Files Chooser": Camera × Files), e diálogo
   * não tira o foco da página. O relógio estoura enquanto a pessoa ainda
   * está escolhendo entre as duas opções, e só quando ela toca em "Files"
   * é que outra activity sobe e o `blur` finalmente chega.
   */
  onAbriuAtrasado?: () => void;
  timeoutMs?: number;
  userAgent?: string;
}

/**
 * Substitui a chamada direta a `watchFilePicker` nas telas que abrem o
 * seletor. Cobre as DUAS falhas do app empacotado de uma vez:
 *
 *   - o seletor não abre        → `onNaoAbriu` (comportamento de sempre);
 *   - o app morre com ele aberto → a marca sobrevive e o boot avisa.
 *
 * Devolve a função de cancelar, que o chamador já invoca no `change` do
 * input (arquivo chegou) e antes de armar de novo.
 */
export function armarSelecao({
  rota,
  ctx,
  onNaoAbriu,
  onAbriuAtrasado,
  timeoutMs,
  userAgent,
}: ArmarSelecaoOpts): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  const ua = userAgent ?? navigator.userAgent ?? '';

  let vivo = true;
  let saiu = false;
  // "Já dissemos pra pessoa que não abriu?" — se dissemos e o app sair
  // depois, era mentira nossa e precisa ser desdita.
  let avisouQueNaoAbriu = false;

  const desarmar = () => {
    if (!vivo) return;
    vivo = false;
    document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    window.removeEventListener('blur', aoSair);
    window.removeEventListener('focus', aoVoltar);
  };

  const encerrar = () => {
    limparEscolhaPendente();
    desarmar();
  };

  const cancelarWatch = watchFilePicker(
    () => {
      // Até onde dá pra saber, não abriu — então não há escolha pendente.
      // Mas NÃO desarmamos os ouvintes: se o seletor aparecer depois,
      // queremos poder voltar atrás em vez de deixar um aviso falso na
      // tela (ver `onAbriuAtrasado`).
      limparEscolhaPendente();
      avisouQueNaoAbriu = true;
      onNaoAbriu();
    },
    { timeoutMs, userAgent: ua },
  );

  // Fora do Android a troca de app não mata o processo — a marca só
  // geraria aviso falso. O watch de "não abriu" continua valendo.
  if (!ehAndroid(ua)) return cancelarWatch;

  function aoSair() {
    saiu = true;
    if (!avisouQueNaoAbriu) return;
    // O seletor abriu, só demorou mais que o relógio: desfaz o aviso e
    // volta a valer a recuperação — daqui pra frente o app pode morrer.
    avisouQueNaoAbriu = false;
    marcarEscolhaPendente(rota, ctx);
    onAbriuAtrasado?.();
  }

  function aoVoltar() {
    // Voltou vivo do seletor (escolheu ou cancelou): a recuperação não é
    // mais necessária. Se tivesse morrido, este código nem rodaria.
    if (!saiu) return;
    encerrar();
  }

  function aoTrocarVisibilidade() {
    if (document.hidden) aoSair();
    else aoVoltar();
  }

  marcarEscolhaPendente(rota, ctx);
  document.addEventListener('visibilitychange', aoTrocarVisibilidade);
  // `blur`/`focus` como rede de segurança: nem toda WebView dispara
  // `visibilitychange` ao abrir outra activity.
  window.addEventListener('blur', aoSair);
  window.addEventListener('focus', aoVoltar);

  return () => {
    cancelarWatch();
    encerrar();
  };
}
