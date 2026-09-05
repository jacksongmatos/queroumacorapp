// priceTable — Tabela de Preços de Pintura da ABRAPP (edição 2026).
//
// A fonte de verdade é a tabela `public.price_table_items` no Supabase
// (migrations/2026-09-05-tabela-precos-abrapp*.sql). Nada é embutido no
// bundle de propósito: assim a loja corrige um valor rodando um UPDATE, sem
// esperar deploy — e não existe uma segunda cópia dos 328 itens pra
// divergir da primeira.
//
// Os valores são de MÃO DE OBRA, material não incluso. Cada item tem três
// faixas (mínimo/média/máximo) e, na maioria das folhas, um eixo de altura.

import { getSupabase } from '@/lib/supabase';
import { NetworkError } from '@/lib/errors';

export const PRICE_TABLE_EDITION = 'ABRAPP 2026';

export type PriceAltura = 'ate_3m' | 'acima_3m';

export interface PriceItem {
  id: string;
  sheet_no: number;
  category: string;
  grupo: string | null;
  tipo: string | null;
  servico: string;
  observacao: string | null;
  altura: PriceAltura | null;
  unidade: string;
  preco_medio: number;
  preco_min: number | null;
  preco_max: number | null;
  sort_order: number;
}

interface RawRow {
  id: string;
  sheet_no: number;
  category: string;
  grupo: string | null;
  tipo: string | null;
  servico: string;
  observacao: string | null;
  altura: string | null;
  unidade: string | null;
  preco_medio: number | string | null;
  preco_min: number | string | null;
  preco_max: number | string | null;
  sort_order: number | null;
}

// Cast manual — a tabela é nova e ainda não está no schema TS gerado
// (`supabase gen types`). Mesmo padrão de artReferences/product_variants.
function priceClient() {
  return getSupabase() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => PromiseLike<{
              data: RawRow[] | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
    };
  };
}

/** `numeric` do Postgres chega como string no supabase-js. */
function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toItem(r: RawRow): PriceItem {
  return {
    id: r.id,
    sheet_no: r.sheet_no,
    category: r.category,
    grupo: r.grupo,
    tipo: r.tipo,
    servico: r.servico,
    observacao: r.observacao,
    altura: r.altura === 'ate_3m' || r.altura === 'acima_3m' ? r.altura : null,
    unidade: r.unidade || 'm2',
    preco_medio: num(r.preco_medio) ?? 0,
    preco_min: num(r.preco_min),
    preco_max: num(r.preco_max),
    sort_order: r.sort_order ?? 0,
  };
}

/**
 * Baixa a tabela inteira (328 itens ≈ 60KB) numa chamada só.
 *
 * Paginar aqui não vale a pena: a tela filtra e agrupa tudo em memória, e
 * um payload único deixa a busca instantânea depois do primeiro carregamento.
 */
export async function fetchPriceTable(): Promise<PriceItem[]> {
  const { data, error } = await priceClient()
    .from('price_table_items')
    .select(
      'id, sheet_no, category, grupo, tipo, servico, observacao, altura, unidade, preco_medio, preco_min, preco_max, sort_order',
    )
    .eq('edicao', PRICE_TABLE_EDITION)
    .order('sheet_no', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    // 42P01 = relação não existe: a migration ainda não rodou. A tela
    // distingue esse caso ("tabela não carregada") de falha de rede, senão
    // o pintor vê "erro de conexão" com a internet perfeita.
    if (error.code === '42P01') return [];
    throw new NetworkError(`Não foi possível carregar a tabela: ${error.message}`);
  }
  return (data ?? []).map(toItem);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers puros — é o que os testes cobrem.

/** minúsculas + sem acento, pra busca casar "orcamento" com "orçamento". */
export function normalizarBusca(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Texto indexado de um item (o que a busca varre). */
function textoDoItem(i: PriceItem): string {
  return normalizarBusca(
    [i.servico, i.grupo, i.tipo, i.category, i.observacao].filter(Boolean).join(' '),
  );
}

export interface PriceFilter {
  q?: string;
  category?: string | null;
  altura?: PriceAltura | null;
}

/**
 * Filtra por texto + categoria + altura.
 *
 * A busca exige TODOS os termos (E, não OU): quem digita "massa premium"
 * quer as duas palavras, e com OU a lista praticamente não filtra nada.
 * Os termos podem estar em campos diferentes do mesmo item.
 *
 * Item SEM altura (diária, demarcação, peça) aparece em qualquer filtro de
 * altura — filtrar altura ali esconderia serviço que simplesmente não tem
 * esse eixo.
 */
export function filtrarPrecos(items: readonly PriceItem[], f: PriceFilter = {}): PriceItem[] {
  const termos = normalizarBusca(f.q ?? '').split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (f.category && i.category !== f.category) return false;
    if (f.altura && i.altura !== null && i.altura !== f.altura) return false;
    if (termos.length === 0) return true;
    const texto = textoDoItem(i);
    return termos.every((t) => texto.includes(t));
  });
}

export interface PriceGroup {
  category: string;
  items: PriceItem[];
}

/**
 * Agrupa por categoria preservando a ordem de chegada (que é sheet_no +
 * sort_order, ou seja, a ordem impressa). Folhas 13 e 14 dividem a mesma
 * categoria de propósito e caem no mesmo grupo.
 */
export function agruparPorCategoria(items: readonly PriceItem[]): PriceGroup[] {
  const grupos: PriceGroup[] = [];
  const porNome = new Map<string, PriceGroup>();
  for (const i of items) {
    let g = porNome.get(i.category);
    if (!g) {
      g = { category: i.category, items: [] };
      porNome.set(i.category, g);
      grupos.push(g);
    }
    g.items.push(i);
  }
  return grupos;
}

/** Categorias na ordem impressa, pra montar os chips de filtro. */
export function listarCategorias(items: readonly PriceItem[]): string[] {
  return agruparPorCategoria(items).map((g) => g.category);
}

const UNIDADES: Record<string, { curto: string; longo: string }> = {
  m2: { curto: 'm²', longo: 'por metro quadrado' },
  metro_linear: { curto: 'm linear', longo: 'por metro linear' },
  unidade: { curto: 'unid.', longo: 'por peça / unidade' },
  diaria: { curto: 'diária', longo: 'por diária de 8h' },
  km: { curto: 'km', longo: 'por quilômetro' },
  rolo: { curto: 'rolo', longo: 'por rolo' },
};

export function unidadeCurta(u: string): string {
  return UNIDADES[u]?.curto ?? u;
}

export function unidadeLonga(u: string): string {
  return UNIDADES[u]?.longo ?? u;
}

export function rotuloAltura(a: PriceAltura | null): string | null {
  if (a === 'ate_3m') return 'até 3 m';
  if (a === 'acima_3m') return 'acima de 3 m';
  return null;
}

/**
 * Um item "sem valor publicado" é o que veio zerado no PDF (folha 13 tem
 * uma linha assim). Mostrar "R$ 0,00" faria o pintor cobrar zero.
 */
export function semValorPublicado(i: PriceItem): boolean {
  return i.preco_medio <= 0;
}

/** preço × quantidade, com quantidade inválida tratada como 1. */
export function totalPara(preco: number | null, quantidade: number): number | null {
  if (preco === null) return null;
  const q = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1;
  return preco * q;
}
