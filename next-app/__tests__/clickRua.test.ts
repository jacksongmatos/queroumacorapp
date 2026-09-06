// Testes da revista Click Rua. Cobrem as funções puras — incluindo a
// conversão da linha do banco em edição — e conferem no disco que as
// páginas do catálogo de FALLBACK existem: ele é o que aparece enquanto a
// migration não roda, e uma edição que promete 8 páginas e tem 7 vira
// página em branco no celular de alguém.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ANGULO_DEITADO,
  ANGULO_VIRADO,
  anguloDaVirada,
  confirmaVirada,
  edicaoDeLinha,
  EDICOES_FALLBACK,
  edicoesProntas,
  paginasDe,
  rotuloEdicao,
  type LinhaEdicao,
} from '@/lib/clickRua';

function caminhoPublico(url: string): string {
  return fileURLToPath(new URL(`../public${url}`, import.meta.url));
}

function linha(over: Partial<LinhaEdicao> = {}): LinhaEdicao {
  return {
    numero: 2,
    quando: 'março de 2026',
    destaque: 'Uma chamada de capa',
    status: 'pronta',
    capa_url: 'https://exemplo/capa.webp',
    paginas: ['https://exemplo/1.webp', 'https://exemplo/2.webp'],
    ...over,
  };
}

describe('catálogo de fallback', () => {
  it('tem a edição 1 pronta e as outras cinco como "em breve"', () => {
    expect(EDICOES_FALLBACK).toHaveLength(6);
    const prontas = edicoesProntas(EDICOES_FALLBACK);
    expect(prontas).toHaveLength(1);
    expect(prontas[0]!.numero).toBe(1);
    expect(prontas[0]!.paginas).toHaveLength(8);
  });

  it('numera as edições em sequência, sem repetir', () => {
    expect(EDICOES_FALLBACK.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('toda página e capa do fallback existe em public/', () => {
    for (const ed of edicoesProntas(EDICOES_FALLBACK)) {
      for (const url of paginasDe(ed)) {
        expect(existsSync(caminhoPublico(url)), `faltando ${url}`).toBe(true);
      }
      expect(existsSync(caminhoPublico(ed.capa!)), `faltando ${ed.capa}`).toBe(true);
    }
    expect(existsSync(caminhoPublico('/click-rua/logo.webp'))).toBe(true);
  });
});

describe('edicaoDeLinha', () => {
  it('converte a linha pronta preservando a ordem das páginas', () => {
    const ed = edicaoDeLinha(linha());
    expect(ed.status).toBe('pronta');
    if (ed.status !== 'pronta') return;
    expect(ed.paginas).toEqual(['https://exemplo/1.webp', 'https://exemplo/2.webp']);
    expect(ed.quando).toBe('março de 2026');
  });

  it('edição marcada PRONTA mas sem página volta a ser "em breve"', () => {
    // Acontece de verdade: a linha é criada antes do upload, ou o upload
    // falha no meio. Abrir um leitor de zero páginas é tela preta sem saída.
    expect(edicaoDeLinha(linha({ paginas: [] })).status).toBe('em_breve');
    expect(edicaoDeLinha(linha({ paginas: null })).status).toBe('em_breve');
  });

  it('descarta página vazia no meio do array', () => {
    const ed = edicaoDeLinha(linha({ paginas: ['https://exemplo/1.webp', '', null as never] }));
    expect(ed.status).toBe('pronta');
    if (ed.status !== 'pronta') return;
    expect(ed.paginas).toHaveLength(1);
  });

  it('sem capa, usa a primeira página como capa', () => {
    const ed = edicaoDeLinha(linha({ capa_url: null }));
    if (ed.status !== 'pronta') throw new Error('deveria estar pronta');
    expect(ed.capa).toBe('https://exemplo/1.webp');
  });

  it('status desconhecido não vira pronta por engano', () => {
    expect(edicaoDeLinha(linha({ status: 'rascunho' })).status).toBe('em_breve');
    expect(edicaoDeLinha(linha({ status: null })).status).toBe('em_breve');
  });
});

describe('rótulo', () => {
  it('usa dois dígitos, como na capa', () => {
    expect(rotuloEdicao(1)).toBe('Edição #01');
    expect(rotuloEdicao(12)).toBe('Edição #12');
  });
});

describe('virada de página (flipbook)', () => {
  const LARGURA = 390; // iPhone

  it('avançar: a folha acompanha o dedo de 0° até -180°', () => {
    expect(anguloDaVirada(0, LARGURA, 'frente')).toBe(ANGULO_DEITADO);
    expect(anguloDaVirada(-LARGURA / 2, LARGURA, 'frente')).toBe(-90);
    expect(anguloDaVirada(-LARGURA, LARGURA, 'frente')).toBe(ANGULO_VIRADO);
  });

  it('voltar: a folha vem de -180° de volta pra 0°', () => {
    expect(anguloDaVirada(0, LARGURA, 'tras')).toBe(ANGULO_VIRADO);
    expect(anguloDaVirada(LARGURA / 2, LARGURA, 'tras')).toBe(-90);
    expect(anguloDaVirada(LARGURA, LARGURA, 'tras')).toBe(ANGULO_DEITADO);
  });

  it('trava nos extremos — arrastar demais não desvira a folha', () => {
    // Sem o clamp, passar de -180 faria a página reaparecer girando ao
    // contrário, que é o bug clássico desse gesto.
    expect(anguloDaVirada(-LARGURA * 3, LARGURA, 'frente')).toBe(ANGULO_VIRADO);
    expect(anguloDaVirada(LARGURA * 3, LARGURA, 'tras')).toBe(ANGULO_DEITADO);
    expect(anguloDaVirada(LARGURA, LARGURA, 'frente')).toBe(ANGULO_DEITADO);
  });

  it('não quebra com largura zero (elemento ainda não medido)', () => {
    expect(anguloDaVirada(-50, 0, 'frente')).toBe(ANGULO_DEITADO);
    expect(anguloDaVirada(50, 0, 'tras')).toBe(ANGULO_VIRADO);
    expect(anguloDaVirada(NaN, LARGURA, 'frente')).toBe(ANGULO_DEITADO);
  });

  it('só completa a virada depois da metade do caminho', () => {
    expect(confirmaVirada(-100, 'frente')).toBe(true);
    expect(confirmaVirada(-80, 'frente')).toBe(false);
    expect(confirmaVirada(-80, 'tras')).toBe(true);
    expect(confirmaVirada(-100, 'tras')).toBe(false);
  });

  it('exatamente na metade, o gesto vira (não fica no limbo)', () => {
    expect(confirmaVirada(-90, 'frente')).toBe(true);
    expect(confirmaVirada(-90, 'tras')).toBe(true);
  });
});
