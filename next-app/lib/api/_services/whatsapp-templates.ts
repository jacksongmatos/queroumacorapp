// lib/api/_services/whatsapp-templates.ts — leitura e normalizacao dos
// templates aprovados na Meta.
//
// Estas funcoes vivem AQUI, e nao no route.ts, porque arquivo de rota do
// Next so aceita um conjunto fechado de exports (GET/POST/runtime/...).
// Exportar um helper de la quebra o build com "X is not a valid Route
// export field" — e isso NAO aparece no `tsc` nem no vitest, so no
// `next build`. Foi o que derrubou o deploy em 2026-09-05.

/** Um `{{n}}` do corpo do template. */
export interface VariavelDeTemplate {
  /** 1-based, como a Meta numera. */
  indice: number;
  /** Exemplo cadastrado no painel, quando existe — vira placeholder. */
  exemplo: string | null;
}

export interface TemplateAprovado {
  nome: string;
  idioma: string;
  categoria: string;
  status: string;
  /** Corpo com os `{{n}}` ainda no lugar — o portal substitui pra prévia. */
  corpo: string | null;
  cabecalho: string | null;
  rodape: string | null;
  variaveis: VariavelDeTemplate[];
}

/**
 * Conta os `{{n}}` do corpo e casa com os exemplos do painel.
 *
 * Contamos pelo TEXTO, não pelo `example` — template pode ter variável sem
 * exemplo cadastrado, e nesse caso o campo tem que aparecer na tela mesmo
 * assim. O contrário (exemplo sem `{{n}}` no texto) é lixo de cadastro e é
 * ignorado.
 */
export function extrairVariaveis(
  corpo: string | null,
  exemplos: string[]
): VariavelDeTemplate[] {
  if (!corpo) return [];
  const indices = new Set<number>();
  for (const m of corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 20) indices.add(n);
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((indice) => ({ indice, exemplo: exemplos[indice - 1] ?? null }));
}

/** Normaliza um item da resposta da Meta/Dualhook. */
export function normalizarTemplate(bruto: unknown): TemplateAprovado | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const t = bruto as {
    name?: unknown;
    language?: unknown;
    category?: unknown;
    status?: unknown;
    components?: unknown;
  };
  const nome = typeof t.name === 'string' ? t.name : '';
  if (!nome) return null;

  let corpo: string | null = null;
  let cabecalho: string | null = null;
  let rodape: string | null = null;
  let exemplos: string[] = [];

  if (Array.isArray(t.components)) {
    for (const c of t.components as Array<Record<string, unknown>>) {
      const tipo = String(c?.type ?? '').toUpperCase();
      const texto = typeof c?.text === 'string' ? c.text : null;
      if (tipo === 'BODY') {
        corpo = texto;
        // A Meta manda os exemplos como array de arrays.
        const ex = (c?.example as { body_text?: unknown })?.body_text;
        if (Array.isArray(ex) && Array.isArray(ex[0])) {
          exemplos = (ex[0] as unknown[]).map((v) => String(v));
        }
      } else if (tipo === 'HEADER' && texto) {
        cabecalho = texto;
      } else if (tipo === 'FOOTER' && texto) {
        rodape = texto;
      }
    }
  }

  return {
    nome,
    idioma: typeof t.language === 'string' ? t.language : 'pt_BR',
    categoria: typeof t.category === 'string' ? t.category : 'UNKNOWN',
    status: typeof t.status === 'string' ? t.status : 'UNKNOWN',
    corpo,
    cabecalho,
    rodape,
    variaveis: extrairVariaveis(corpo, exemplos),
  };
}

