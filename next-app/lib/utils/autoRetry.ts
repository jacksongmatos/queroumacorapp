// autoRetry — "recarrega sozinho" com freio.
//
// Motivo (2026-08-29): o app fica um tempão fechado no celular, o Android
// mata o processo do WebView, a pessoa reabre e cai numa tela de erro que
// diz "recarregue a página". Ela tem que fazer na mão — e muita gente
// simplesmente desiste do app ali.
//
// O service worker já resolve isso quando a falha é de NAVEGAÇÃO (a página
// "Reconectando…" em public/sw.js tem exatamente este mesmo backoff). Mas
// quando a falha é do lado do React — hidratação, payload de rota que não
// chegou, boundary estourado — o SW nem vê o problema, porque não houve
// request de documento. Então as duas telas de erro do Next precisam do
// mesmo comportamento.
//
// O freio importa: sem teto, uma falha permanente vira laço infinito de
// reload, que gasta bateria e nunca mostra o erro pra ninguém. Depois de
// MAX_TENTATIVAS dentro da JANELA, para e deixa o botão manual.

const CHAVE = 'qucAutoRetry';
const MAX_TENTATIVAS = 6;
const JANELA_MS = 120_000;
const BASE_MS = 2500;
const PASSO_MS = 1500;

interface Estado {
  n: number;
  t: number;
}

function ler(now: number): Estado {
  try {
    const cru = sessionStorage.getItem(CHAVE);
    const st = cru ? (JSON.parse(cru) as Estado) : null;
    if (st && typeof st.n === 'number' && typeof st.t === 'number' && now - st.t <= JANELA_MS) {
      return st;
    }
  } catch {
    // Janela anônima, storage bloqueado: conta como primeira tentativa.
  }
  return { n: 0, t: now };
}

/**
 * Agenda uma retomada automática. Devolve a função de cancelar (para o
 * caso de a tela sair antes) e se a tentativa foi de fato agendada — a
 * UI usa isso pra dizer "tentando de novo" ou "não consegui".
 */
export function agendarRetomada(recarregar: () => void): {
  agendado: boolean;
  cancelar: () => void;
} {
  if (typeof window === 'undefined') return { agendado: false, cancelar: () => {} };

  const now = Date.now();
  const st = ler(now);
  if (st.n >= MAX_TENTATIVAS) return { agendado: false, cancelar: () => {} };

  st.n += 1;
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(st));
  } catch {
    // Sem memória o contador não avança — o teto abaixo ainda vale por
    // sessão de tela, e o botão manual continua ali.
  }

  const timer = window.setTimeout(recarregar, BASE_MS + st.n * PASSO_MS);
  // Voltou a internet: não espera o cronômetro.
  const aoVoltar = () => recarregar();
  window.addEventListener('online', aoVoltar, { once: true });

  return {
    agendado: true,
    cancelar: () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', aoVoltar);
    },
  };
}

/** Chamar quando a tela carregou bem — zera o contador. */
export function limparRetomada(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}
