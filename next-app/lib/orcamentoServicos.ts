// orcamentoServicos — os itens de serviço de um orçamento (tile "Orçamento ·
// Crie e envie"), com a sugestão de preço vinda da Tabela ABRAPP.
//
// Decisões que valem registro:
//
//  1. O VALOR NASCE VAZIO, a sugestão fica do lado. A tabela é sugestão de
//     mão de obra; quem assina o orçamento é o pintor. Preencher o campo
//     sozinho faria a pessoa mandar preço de tabela sem ter decidido nada —
//     e "Usar sugestão" é um toque.
//
//  2. Quantidade e valor são TEXTO no estado (o que a pessoa digitou). A
//     conversão pra número acontece só nas contas, aqui, num lugar só —
//     `parseBRL` aceita "1.500,50" e "1500.50" (regra P1 de 2026-09-01).
//
//  3. Tudo aqui é puro e independente de React: o QuoteWizard usa pra montar
//     a tela, e o PDF/pipeline usam pra LER o que foi gravado em
//     `quotes.quote_data.servicos`. Uma conta só pros dois lados, senão o
//     total da tela e o do PDF divergem.

import { parseBRL, fmtBRL } from '@/lib/utils';
import {
  rotuloAltura,
  unidadeCurta,
  type PriceAltura,
  type PriceItem,
} from '@/lib/services/priceTable';

export interface SugestaoDePreco {
  min: number | null;
  medio: number;
  max: number | null;
}

export interface ServicoDoOrcamento {
  /** id local (só pra React/remoção) */
  id: string;
  /** `price_table_items.id`; null = serviço avulso digitado pelo pintor */
  priceItemId: string | null;
  servico: string;
  /** "Látex · Acrílico Premium · até 3 m" — só pra tela */
  detalhe: string | null;
  /** chave de unidade da tabela ('m2', 'diaria', 'unidade'…) */
  unidade: string;
  /** texto do campo; vazio/inválido conta como 1 */
  quantidade: string;
  /** texto do campo; VAZIO por padrão (decisão 1) */
  valorUnitario: string;
  sugestao: SugestaoDePreco | null;
}

/** Chave onde a lista vive dentro de `quotes.quote_data`. */
export const QUOTE_DATA_SERVICOS_KEY = 'servicos';

let seq = 0;
export function novoIdDeServico(): string {
  seq += 1;
  return `srv-${Date.now().toString(36)}-${seq}`;
}

/** Monta uma linha a partir de um item da Tabela ABRAPP. */
export function servicoDoItemDaTabela(item: PriceItem, id: string = novoIdDeServico()): ServicoDoOrcamento {
  const detalhe = [item.grupo, item.tipo, rotuloAltura(item.altura)].filter(Boolean).join(' · ');
  return {
    id,
    priceItemId: item.id,
    servico: item.servico,
    detalhe: detalhe || null,
    unidade: item.unidade,
    quantidade: '1',
    valorUnitario: '',
    sugestao:
      item.preco_medio > 0
        ? { min: item.preco_min, medio: item.preco_medio, max: item.preco_max }
        : null,
  };
}

/** Linha livre — serviço que não está na tabela (grafite, automotivo…). */
export function servicoAvulso(nome = '', id: string = novoIdDeServico()): ServicoDoOrcamento {
  return {
    id,
    priceItemId: null,
    servico: nome,
    detalhe: null,
    unidade: 'unidade',
    quantidade: '1',
    valorUnitario: '',
    sugestao: null,
  };
}

/**
 * Deduz o eixo de altura da tabela a partir do campo "Acesso" do orçamento.
 * "Andaime (3-6m)" e "cadeira suspensa (acima 6m)" → acima de 3 m; térreo e
 * escada → até 3 m. Serve só pra PRÉ-selecionar o filtro do seletor — a
 * pessoa troca se quiser.
 */
export function alturaDoAcesso(access: string | null | undefined): PriceAltura | null {
  const a = (access ?? '').toLowerCase();
  if (!a) return null;
  if (/andaime|acima|suspens/.test(a)) return 'acima_3m';
  return 'ate_3m';
}

/** Quantidade numérica; vazio, inválido ou ≤ 0 vale 1 (mesma regra de `totalPara`). */
export function quantidadeDe(s: ServicoDoOrcamento): number {
  const q = Number(String(s.quantidade ?? '').replace(',', '.'));
  return Number.isFinite(q) && q > 0 ? q : 1;
}

/** Valor unitário digitado; vazio ou ≤ 0 → null ("ainda não decidido"). */
export function valorUnitarioDe(s: ServicoDoOrcamento): number | null {
  const raw = String(s.valorUnitario ?? '').trim();
  if (!raw) return null;
  const v = parseBRL(raw);
  return v > 0 ? v : null;
}

/** valor digitado × quantidade; null enquanto o valor estiver vazio. */
export function subtotalDoServico(s: ServicoDoOrcamento): number | null {
  const v = valorUnitarioDe(s);
  if (v === null) return null;
  return arredondar(v * quantidadeDe(s));
}

/** média da tabela × quantidade; null sem sugestão. */
export function subtotalSugerido(s: ServicoDoOrcamento): number | null {
  if (!s.sugestao || s.sugestao.medio <= 0) return null;
  return arredondar(s.sugestao.medio * quantidadeDe(s));
}

export interface TotaisDosServicos {
  /** soma só do que a pessoa já preencheu */
  preenchido: number;
  /** soma usando o valor digitado e, onde falta, a média da tabela */
  sugerido: number;
  /** quantas linhas ainda estão sem valor */
  semValor: number;
  /** quantas linhas sem valor NEM sugestão (avulso ou item zerado) */
  semSugestao: number;
}

export function totaisDosServicos(lista: readonly ServicoDoOrcamento[]): TotaisDosServicos {
  let preenchido = 0;
  let sugerido = 0;
  let semValor = 0;
  let semSugestao = 0;
  for (const s of lista) {
    const sub = subtotalDoServico(s);
    if (sub !== null) {
      preenchido += sub;
      sugerido += sub;
      continue;
    }
    semValor += 1;
    const sug = subtotalSugerido(s);
    if (sug === null) semSugestao += 1;
    else sugerido += sug;
  }
  return {
    preenchido: arredondar(preenchido),
    sugerido: arredondar(sugerido),
    semValor,
    semSugestao,
  };
}

/** Uma linha de texto por serviço — WhatsApp, e-mail, descrição pra IA. */
export function descreverServico(s: ServicoDoOrcamento): string {
  const nome = s.servico.trim() || 'Serviço';
  const qtd = quantidadeDe(s);
  const unid = unidadeCurta(s.unidade);
  const v = valorUnitarioDe(s);
  const sub = subtotalDoServico(s);
  const base = `${nome} — ${fmtNum(qtd)} ${unid}`;
  if (v === null || sub === null) return `${base} (valor a definir)`;
  return `${base} × R$ ${fmtBRL(v)} = R$ ${fmtBRL(sub)}`;
}

/**
 * Lê a lista gravada em `quote_data` (jsonb) sem confiar no formato: linha
 * malformada é descartada em vez de derrubar o PDF inteiro. Aceita o objeto
 * `quote_data` ou a própria lista.
 */
export function servicosDoQuoteData(qd: unknown): ServicoDoOrcamento[] {
  const bruto = Array.isArray(qd)
    ? qd
    : qd && typeof qd === 'object'
      ? (qd as Record<string, unknown>)[QUOTE_DATA_SERVICOS_KEY]
      : null;
  if (!Array.isArray(bruto)) return [];
  const out: ServicoDoOrcamento[] = [];
  bruto.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    if (typeof r.servico !== 'string' || !r.servico.trim()) return;
    const sug = r.sugestao;
    let sugestao: SugestaoDePreco | null = null;
    if (sug && typeof sug === 'object') {
      const so = sug as Record<string, unknown>;
      const medio = numOuNull(so.medio);
      if (medio !== null && medio > 0) {
        sugestao = { min: numOuNull(so.min), medio, max: numOuNull(so.max) };
      }
    }
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : `srv-${i}`,
      priceItemId: typeof r.priceItemId === 'string' ? r.priceItemId : null,
      servico: r.servico,
      detalhe: typeof r.detalhe === 'string' && r.detalhe ? r.detalhe : null,
      unidade: typeof r.unidade === 'string' && r.unidade ? r.unidade : 'unidade',
      quantidade: textoOuVazio(r.quantidade) || '1',
      valorUnitario: textoOuVazio(r.valorUnitario),
      sugestao,
    });
  });
  return out;
}

// ─── privados ─────────────────────────────────────────────────────────────

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

function numOuNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function textoOuVazio(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
