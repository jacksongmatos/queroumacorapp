// utils.ts — port APENAS dos helpers puros de /utils.js.
// As funções DOM-bound (toast, showModal, closeModals, hideModal, fmtBRL com
// HTMLInputElement, _compressImageFile, _extractVideoFrame, setButtonLoading,
// emptyState, errorState, skeletonRows) NÃO foram portadas — viram React
// components/hooks numa camada superior. fmtBRL aqui tem signature diferente
// do vanilla: aceita number, devolve string formatada (a versão DOM-bound
// pode ser construída por cima dela em hooks).

/**
 * Extrai mensagem segura de um valor de catch (que em TS é `unknown`).
 * Substitui o padrão repetido `(e as Error)?.message ?? String(e)` que
 * aparece em todo lugar — type guard correto sem cast.
 */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return String(e);
  } catch {
    return 'unknown error';
  }
}

// Helpers de formatação de R$ (pt-BR): aceita "500", "500,00", "1.500,00",
// "1500.50" no input e devolve Number normalizado.
//
// BUG CORRIGIDO (2026-09-01): a versão anterior apagava TODOS os pontos como
// separador de milhar antes de trocar a vírgula. Quem digitava o decimal com
// PONTO tinha o valor multiplicado por 100 — "1500.50" virava 150050 e
// "0.99" virava 99. Não era caso de canto: o campo de preço usa
// `inputMode="decimal"`, e o teclado do Android oferece justamente o ponto.
// Atingia preço de arte à venda, Financeiro, Agenda e o `brlSchema`. E o
// contrato documentado aqui e em `schemas.ts` já dizia aceitar "1500.50".
//
// A ambiguidade real é "1.500": em pt-BR é mil e quinhentos; em en-US é um e
// meio. As regras abaixo resolvem isso assumindo pt-BR, que é o público:
//
//   1. Número entra direto — `parseBRL(1500.5)` também estava quebrado
//      (virava 15005), porque tudo passava por String() antes.
//   2. Tem vírgula? A vírgula é o decimal (convenção pt-BR) e todo ponto é
//      milhar. Cobre "1.500,50" e "1500,50".
//   3. Só pontos, mais de um? São milhar: "1.234.567".
//   4. Só um ponto? Decimal quando sobram 1 ou 2 casas ("1500.50", "12.5")
//      ou quando a parte inteira é zero ("0.999"); com 3 casas é milhar
//      ("1.500" = 1500), que é o uso pt-BR.
export function parseBRL(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const raw = String(val == null ? '' : val).trim();
  if (!raw) return 0;

  // Fora dígitos, separadores e sinal, nada importa ("R$ 1.500,50").
  const limpo = raw.replace(/[^\d.,-]/g, '');
  if (!limpo) return 0;
  const negativo = limpo.startsWith('-');
  const corpo = limpo.replace(/-/g, '');

  const temVirgula = corpo.includes(',');
  const pontos = (corpo.match(/\./g) || []).length;

  let normalizado: string;
  if (temVirgula) {
    // Regra 2: vírgula manda, ponto é milhar.
    normalizado = corpo.replace(/\./g, '').replace(/,/g, '.');
  } else if (pontos > 1) {
    // Regra 3.
    normalizado = corpo.replace(/\./g, '');
  } else if (pontos === 1) {
    const [inteiro, decimais] = corpo.split('.');
    const ehDecimal = decimais.length <= 2 || /^0*$/.test(inteiro);
    normalizado = ehDecimal ? corpo : corpo.replace('.', '');
  } else {
    normalizado = corpo;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

// Refactor do vanilla: a versão antiga era `fmtBRL(el: HTMLInputElement)` que
// mutava `el.value`. Aqui é função pura `(number) => string` — a versão
// DOM-bound (que opera num <input>) vira hook/component separado.
export function fmtBRL(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: unknown): string {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] || ch);
}

// Escapa um valor para uso DENTRO de uma string JS em atributo onclick="..."
// Mantido pra paridade — a maioria dos call sites do Next.js usa
// addEventListener / handlers JSX, mas alguns templates server-side ainda
// emitem HTML cru (ex.: e-mails, dashboards admin).
export function escapeJsArg(str: unknown): string {
  return String(str == null ? '' : str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/[<>]/g, '');
}

// Helper interno usado por getTimeAgo no fallback (>= 7 dias).
function dateBR(dateStr: string | Date): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function getTimeAgo(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'AGORA';
  if (mins < 60) return 'HA ' + mins + ' MIN';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return 'HA ' + hrs + ' HORA' + (hrs > 1 ? 'S' : '');
  const days = Math.floor(hrs / 24);
  if (days < 7) return 'HA ' + days + ' DIA' + (days > 1 ? 'S' : '');
  return dateBR(dateStr);
}

// Anonimiza email: substitui o domínio por @ (ex.: "a@b.co" → "@a").
export function stripEmail(s: string | null | undefined): string {
  if (!s) return s ?? '';
  return String(s).replace(/([A-Za-z0-9._%+\-]+)@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '@$1');
}

export function cleanHandle(
  p: { tag?: string | null; name?: string | null } | null | undefined,
  fb?: string
): string {
  if (p && p.tag) return '@' + p.tag;
  return stripEmail((p && p.name) || fb || 'Usuário');
}

export function isVideoUrl(u: string | null | undefined): boolean {
  return /\.(mp4|webm|mov|m4v|ogg|ogv)(\?|#|$)/i.test(u || '');
}

// Normaliza nome de cliente para dedup (lowercase + trim + colapsa espaços).
// Usado no CRM pra agrupar leads/clientes com mesmo nome em formatações
// diferentes ("João Silva", " joão silva ", "JOÃO SILVA").
export function crmNormName(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Meses inteiros entre uma data e hoje (negativo nunca: clamp em 0).
export function crmMonthsSince(dateStr: string | Date | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m -= 1;
  return Math.max(0, m);
}

// Hash string → uint determinístico (djb2-ish). Usado pra pintar avatares
// fallback (mapear nome → cor estável) e pra estabilizar ordenação em listas
// que precisam ser determinísticas sem ID (ex.: lista de comments sem id).
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Normaliza texto pra busca: remove acentos, lowercase, e adiciona espaços
// nas bordas pra suportar `indexOf(' joao ')` (match palavra inteira).
export function normTxt(s: unknown): string {
  return (
    ' ' +
    String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') +
    ' '
  );
}

// Renderiza rating como string de estrelas cheias + vazias (5 total).
// `r` pode vir como number ou string — clamp em 0..5 implícito via Math.round.
export function starStr(r: number | string | null | undefined): string {
  const n = Math.round(Number(r) || 0);
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}

/** Fuso oficial do app — ver a regra em CLAUDE.md. */
export const TZ_APP = 'America/Sao_Paulo';

/**
 * "Que dia é hoje?" em BRASÍLIA, no formato "YYYY-MM-DD".
 *
 * A2 (01/09/2026) — antes isto usava `getTimezoneOffset()`, ou seja, o fuso
 * do APARELHO. O patch de fuso do `app/layout.tsx` só cobre
 * `toLocale{Date,Time,}String`; `getTimezoneOffset` passa direto. Resultado:
 * o app exibia tudo em Brasília mas decidia QUAL É O DIA pelo relógio do
 * celular. Não é caso de viajante: o Brasil tem mais de um fuso — em Manaus
 * (UTC−4), entre meia-noite e 1h, o aparelho diz um dia e Brasília já está
 * no seguinte. Isso deslocava o destaque de "hoje" na agenda, o recorte do
 * dia no Financeiro e a data de follow-up do pipeline.
 *
 * Usa `Intl` com `timeZone` explícito — `formatToParts` em vez de confiar no
 * formato de algum locale, e sem depender do patch global (que mexe só em
 * `Date.prototype`, não em `Intl.DateTimeFormat`).
 */
export function ymdBrt(d: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_APP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return `${pega('year')}-${pega('month')}-${pega('day')}`;
}

/**
 * "YYYY-MM-DD" a partir dos CAMPOS de calendário do próprio Date.
 *
 * Para um Date construído como `new Date(ano, mes-1, dia)` — limites de mês
 * do grid da agenda, por exemplo — o ano/mês/dia já SÃO a resposta: passar
 * por fuso nenhum é o certo, porque não há instante a converter. Usar
 * `ymdBrt` aqui é que introduziria deslocamento.
 */
export function ymdDeCampos(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * @deprecated Use `ymdBrt()` (hoje em Brasília) ou `ymdDeCampos()` (formatar
 * um Date montado a partir de ano/mês/dia). Mantido porque o nome aparece em
 * código antigo; hoje é só um apelido de `ymdBrt`.
 */
export function agYmd(d: Date): string {
  return ymdBrt(d);
}

// Detecta tipo de arquivo (image vs video). Útil pra preview/feedback
// antes do upload. NOTA: opera sobre `File` (browser API) — em SSR
// nunca é chamado, mas o tipo está disponível via lib.dom.
export function getMediaType(file: File | null | undefined): 'video' | 'image' {
  if (!file) return 'image';
  if (file.type && file.type.startsWith('video/')) return 'video';
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'webm', 'mov', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';
  return 'image';
}

// Throttle: chama fn no PRIMEIRO call + máximo 1x a cada `ms` enquanto receber
// calls. Diferente de debounce (espera pausa) — throttle garante rate fixo.
// Uso: scroll, resize, mousemove, autosave em input change.
export function throttle<F extends (...args: never[]) => unknown>(
  fn: F,
  ms: number
): (...args: Parameters<F>) => void {
  let last = 0;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  return function throttled(this: unknown, ...args: Parameters<F>): void {
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed >= ms) {
      last = now;
      (fn as unknown as (...a: Parameters<F>) => unknown).apply(this, args);
    } else {
      // Garante trailing call pra capturar o último estado.
      if (trailing) clearTimeout(trailing);
      trailing = setTimeout(() => {
        last = Date.now();
        (fn as unknown as (...a: Parameters<F>) => unknown).apply(this, args);
      }, ms - elapsed);
    }
  };
}
