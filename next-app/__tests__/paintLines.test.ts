// paintLines (2026-08-28) — rendimento por linha de tinta na Calculadora.
// A base histórica é 200 m²/demão por lata 18L; coverageScale converte a
// demanda pra linha escolhida (rende mais → fator < 1 → menos tinta).

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LINE,
  PAINT_LINES,
  coverageScale,
  getPaintLine,
  paintLineBrands,
} from '@/lib/paintLines';

describe('paintLines', () => {
  it('linha padrão tem fator 1 (comportamento histórico preservado)', () => {
    expect(coverageScale(DEFAULT_LINE)).toBe(1);
  });

  it('linha que rende MAIS que a média pede MENOS tinta', () => {
    const eco = getPaintLine('sw-metalatex-eco'); // 300 m²/demão
    expect(coverageScale(eco)).toBeLessThan(1);
    expect(coverageScale(eco)).toBeCloseTo(200 / 300, 5);
  });

  it('linha econômica (rende menos) pede MAIS tinta', () => {
    const kemtone = getPaintLine('sw-kemtone'); // 180 m²/demão
    expect(coverageScale(kemtone)).toBeGreaterThan(1);
  });

  it('id desconhecido cai na linha padrão (nunca quebra a calculadora)', () => {
    expect(getPaintLine('nao-existe')).toEqual(DEFAULT_LINE);
  });

  it('rendimento inválido não zera a conta (fator 1)', () => {
    expect(coverageScale({ id: 'x', brand: '', name: 'x', m2PerCoat18L: 0 })).toBe(1);
  });

  it('todas as linhas têm rendimento plausível (50–600 m²/demão por 18L)', () => {
    for (const l of PAINT_LINES) {
      expect(l.m2PerCoat18L).toBeGreaterThan(50);
      expect(l.m2PerCoat18L).toBeLessThan(600);
    }
  });

  it('ids são únicos', () => {
    const ids = PAINT_LINES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marcas agrupadas incluem Sherwin-Williams', () => {
    expect(paintLineBrands()).toContain('Sherwin-Williams');
  });
});
