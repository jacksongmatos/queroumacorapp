// Geometria do enquadramento (2026-09-07). A prévia (CSS em %) e o recorte
// real (canvas em px) saem da mesma conta — estes testes travam que as duas
// descrevem o MESMO pedaço da foto, senão o que a pessoa vê não é o que sobe.

import { describe, it, expect } from 'vitest';
import {
  PROPORCOES,
  arrastar,
  aspectRatioCss,
  caixaContain,
  clampDeslocamento,
  estiloPreview,
  ratioDe,
  recorteCover,
  tamanhoSaida,
} from '@/lib/enquadramento';

describe('recorteCover', () => {
  it('foto em pé num quadro quadrado: largura inteira, corta altura conforme o deslocamento', () => {
    // 800×1200 (2:3) em 1:1 → janela 800×800.
    expect(recorteCover(800, 1200, 1, { x: 0.5, y: 0.5 })).toEqual({ sx: 0, sy: 200, sw: 800, sh: 800 });
    expect(recorteCover(800, 1200, 1, { x: 0.5, y: 0 })).toEqual({ sx: 0, sy: 0, sw: 800, sh: 800 });
    expect(recorteCover(800, 1200, 1, { x: 0.5, y: 1 })).toEqual({ sx: 0, sy: 400, sw: 800, sh: 800 });
  });

  it('foto deitada num quadro em pé: altura inteira, corta largura', () => {
    // 1600×900 em 4:5 → janela 720×900.
    expect(recorteCover(1600, 900, 4 / 5, { x: 0, y: 0.5 })).toEqual({ sx: 0, sy: 0, sw: 720, sh: 900 });
    expect(recorteCover(1600, 900, 4 / 5, { x: 1, y: 0.5 })).toEqual({ sx: 880, sy: 0, sw: 720, sh: 900 });
  });

  it('foto já na proporção do quadro não corta nada', () => {
    expect(recorteCover(1000, 1000, 1, { x: 0.2, y: 0.9 })).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1000 });
  });

  it('deslocamento fora de 0..1 é travado', () => {
    expect(recorteCover(800, 1200, 1, { x: 0.5, y: 7 })).toEqual({ sx: 0, sy: 400, sw: 800, sh: 800 });
    expect(clampDeslocamento({ x: -1, y: Number.NaN })).toEqual({ x: 0, y: 0.5 });
  });
});

describe('estiloPreview × recorteCover: a mesma janela', () => {
  // Verifica que a fração escondida na prévia coincide com o sy do recorte.
  it('preencher, foto em pé em 1:1', () => {
    const e = estiloPreview(800, 1200, 1, { x: 0.5, y: 0.25 }, 'preencher');
    expect(e.width).toBe('100%');
    expect(e.height).toBe('150%');
    // top = -(150-100)*0.25 = -12.5% do quadro. Em px de foto: quadro=800px
    // de foto, 12.5% de 800 = 100 = sy do recorte com y=0.25.
    expect(e.top).toBe('-12.5%');
    expect(recorteCover(800, 1200, 1, { x: 0.5, y: 0.25 }).sy).toBe(100);
    expect(e.arrastavel).toBe(true);
  });

  it('preencher, foto na proporção exata não é arrastável', () => {
    const e = estiloPreview(1000, 1000, 1, { x: 0.5, y: 0.5 }, 'preencher');
    expect(e.width).toBe('100%');
    expect(e.height).toBe('100%');
    expect(e.arrastavel).toBe(false);
  });

  it('ajustar: foto inteira centralizada dentro do quadro', () => {
    const e = estiloPreview(800, 1200, 1, { x: 0, y: 0 }, 'ajustar');
    expect(e.height).toBe('100%');
    expect(parseFloat(e.width)).toBeCloseTo(66.667, 2);
    expect(parseFloat(e.left)).toBeCloseTo(16.667, 2);
    expect(e.arrastavel).toBe(false);
  });
});

describe('caixaContain', () => {
  it('encolhe a foto pra caber e centraliza', () => {
    expect(caixaContain(1000, 1000, 800, 1200)).toEqual({
      dx: (1000 - 800 * (1000 / 1200)) / 2,
      dy: 0,
      dw: 800 * (1000 / 1200),
      dh: 1000,
    });
  });
});

describe('tamanhoSaida', () => {
  it('preencher: o tamanho é o da janela, limitado a maxDim sem ampliar', () => {
    expect(tamanhoSaida(800, 1200, 1, 'preencher', 1920)).toEqual({ w: 800, h: 800 });
    expect(tamanhoSaida(4000, 6000, 1, 'preencher', 1920)).toEqual({ w: 1920, h: 1920 });
  });

  it('ajustar: o quadro encosta na foto no lado justo', () => {
    expect(tamanhoSaida(800, 1200, 1, 'ajustar', 1920)).toEqual({ w: 1200, h: 1200 });
    // 1600×900 em 4:5 daria 1600×2000; 2000 passa do teto e a saída encolhe.
    expect(tamanhoSaida(1600, 900, 4 / 5, 'ajustar', 1920)).toEqual({ w: 1536, h: 1920 });
    expect(tamanhoSaida(1600, 900, 4 / 5, 'ajustar', 4000)).toEqual({ w: 1600, h: 2000 });
  });

  it('nunca devolve zero', () => {
    expect(tamanhoSaida(1, 1, 16 / 9, 'preencher', 1920).h).toBeGreaterThanOrEqual(1);
  });
});

describe('arrastar', () => {
  it('arrastar a foto pra cima mostra a parte de BAIXO (deslocamento cresce)', () => {
    const r = arrastar({ x: 0.5, y: 0.5 }, { x: 0, y: -50 }, { x: 0, y: 200 });
    expect(r.y).toBeCloseTo(0.75);
    expect(r.x).toBe(0.5);
  });

  it('sem sobra no eixo, o eixo não muda', () => {
    const r = arrastar({ x: 0.5, y: 0.5 }, { x: 100, y: 0 }, { x: 0, y: 0 });
    expect(r).toEqual({ x: 0.5, y: 0.5 });
  });

  it('não passa das bordas', () => {
    expect(arrastar({ x: 0.5, y: 0.9 }, { x: 0, y: -500 }, { x: 0, y: 100 }).y).toBe(1);
  });
});

describe('catálogo', () => {
  it('Original é a primeira opção e não tem ratio', () => {
    expect(PROPORCOES[0].key).toBe('original');
    expect(ratioDe('original')).toBeNull();
    expect(ratioDe('4:5')).toBeCloseTo(0.8);
  });

  it('aspectRatioCss só com as duas medidas válidas', () => {
    expect(aspectRatioCss(800, 1000)).toBe('800 / 1000');
    expect(aspectRatioCss(null, 1000)).toBeNull();
    expect(aspectRatioCss(0, 1000)).toBeNull();
  });
});
