// paintLines.ts — rendimento POR LINHA de tinta pra Calculadora.
//
// Cada linha rende diferente; a calculadora usava uma média única
// (~200 m² por demão por lata 18L, a base "galão 3,6L ≈ 20 m² em 2
// demãos" do QA). Agora a linha escolhida escala a demanda.
//
// `m2PerCoat18L` = rendimento POR DEMÃO de UMA lata 18L, o número que
// vem no rótulo ("rendimento: até X m² por demão").
//
// ⚠️ VALORES DE PARTIDA a partir dos rótulos usuais — CONFERIR com a
// Cali Colors / rótulo atual antes de tratar como oficiais; ajustar aqui
// é 1 linha por produto. Marcas novas (Suvinil, Coral…) entram só
// acrescentando itens ao array — a UI agrupa por `brand`.
//
// Mantido PURO (sem imports) pra teste unitário direto.

export interface PaintLine {
  id: string;
  /** Marca (agrupa o <optgroup> do seletor). Vazio = genérica. */
  brand: string;
  name: string;
  /** Rendimento por demão de uma lata 18L (m²), número do rótulo. */
  m2PerCoat18L: number;
}

/** Base histórica da calculadora: lata 18L ≈ 100 m² num acabamento de
 *  2 demãos → 200 m² por demão. É o "Média do mercado" do seletor. */
export const DEFAULT_LINE: PaintLine = {
  id: 'padrao',
  brand: '',
  name: 'Média do mercado',
  m2PerCoat18L: 200,
};

export const PAINT_LINES: ReadonlyArray<PaintLine> = [
  DEFAULT_LINE,
  // ── Sherwin-Williams ─────────────────────────────────────────────────
  { id: 'sw-metalatex-requinte', brand: 'Sherwin-Williams', name: 'Metalatex Requinte Superlavável', m2PerCoat18L: 330 },
  { id: 'sw-metalatex-eco', brand: 'Sherwin-Williams', name: 'Metalatex Eco Acrílico', m2PerCoat18L: 300 },
  { id: 'sw-novacor', brand: 'Sherwin-Williams', name: 'Novacor Parede', m2PerCoat18L: 250 },
  { id: 'sw-kemtone', brand: 'Sherwin-Williams', name: 'Kem Tone', m2PerCoat18L: 180 },
];

export function getPaintLine(id: string): PaintLine {
  return PAINT_LINES.find((l) => l.id === id) ?? DEFAULT_LINE;
}

/**
 * Fator que converte a demanda calculada na base histórica (200 m²/demão
 * por 18L) pra linha escolhida. Linha que rende MAIS → fator < 1 → menos
 * tinta; linha econômica → fator > 1 → mais tinta.
 */
export function coverageScale(line: PaintLine): number {
  if (!line.m2PerCoat18L || line.m2PerCoat18L <= 0) return 1;
  return DEFAULT_LINE.m2PerCoat18L / line.m2PerCoat18L;
}

/** Marcas na ordem de exibição (genérica primeiro, depois alfabético). */
export function paintLineBrands(): string[] {
  const brands = new Set<string>();
  for (const l of PAINT_LINES) if (l.brand) brands.add(l.brand);
  return [...brands].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
