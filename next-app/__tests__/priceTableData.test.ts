// Guarda do CONJUNTO DE DADOS da tabela da ABRAPP.
//
// Os 328 itens foram transcritos à mão de um PDF que é imagem pura (o
// documento não tem camada de texto). Erro de transcrição não quebra
// compilação nem teste de componente: vira preço errado num orçamento de
// cliente. Este teste lê o arquivo de migration e checa o que dá pra checar
// sem o banco — estrutura, vocabulário e coerência mínimo ≤ média ≤ máximo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SQL = readFileSync(
  new URL('../../migrations/2026-09-05-tabela-precos-abrapp-dados.sql', import.meta.url),
  'utf8',
);

interface Linha {
  sheet: number;
  category: string;
  grupo: string | null;
  tipo: string | null;
  servico: string;
  observacao: string | null;
  unidade: string;
  medio: number;
  min: number;
  max: number;
  ordem: number;
}

/** Quebra por vírgula respeitando aspas simples (e o escape '' do SQL). */
function campos(linha: string): string[] {
  const out: string[] = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]!;
    if (c === "'") {
      if (dentroDeAspas && linha[i + 1] === "'") {
        atual += "'";
        i += 1;
        continue;
      }
      dentroDeAspas = !dentroDeAspas;
      continue;
    }
    if (c === ',' && !dentroDeAspas) {
      out.push(atual);
      atual = '';
      continue;
    }
    atual += c;
  }
  out.push(atual);
  return out;
}

function parseLinhas(): Linha[] {
  const linhas: Linha[] = [];
  for (const bruta of SQL.split('\n')) {
    const m = /^\((\d+),(.*)\)[,;]?$/.exec(bruta.trim());
    if (!m) continue;
    const f = campos(m[2]!);
    if (f.length !== 10) throw new Error(`campos inesperados (${f.length}): ${bruta.slice(0, 70)}`);
    const vazio = (s: string) => (s.trim() === 'NULL' ? null : s);
    linhas.push({
      sheet: Number(m[1]),
      category: f[0]!,
      grupo: vazio(f[1]!),
      tipo: vazio(f[2]!),
      servico: f[3]!,
      observacao: vazio(f[4]!),
      unidade: f[5]!,
      medio: Number(f[6]),
      min: Number(f[7]),
      max: Number(f[8]),
      ordem: Number(f[9]),
    });
  }
  return linhas;
}

const LINHAS = parseLinhas();

const UNIDADES_VALIDAS = new Set(['m2', 'metro_linear', 'unidade', 'diaria', 'km', 'rolo']);

describe('dados da tabela ABRAPP 2026', () => {
  it('tem as 19 folhas e os 328 itens', () => {
    expect(LINHAS).toHaveLength(328);
    expect(new Set(LINHAS.map((l) => l.sheet)).size).toBe(19);
  });

  it('numera sort_order de 1 a N dentro de cada folha, sem buraco nem repetição', () => {
    // É a chave do upsert (edicao, sheet_no, sort_order): repetir aqui faria
    // uma linha sobrescrever a outra silenciosamente no banco.
    const porFolha = new Map<number, number[]>();
    for (const l of LINHAS) {
      const lista = porFolha.get(l.sheet) ?? [];
      lista.push(l.ordem);
      porFolha.set(l.sheet, lista);
    }
    for (const [folha, ordens] of porFolha) {
      const esperado = Array.from({ length: ordens.length }, (_, i) => i + 1);
      expect(ordens, `folha ${folha}`).toEqual(esperado);
    }
  });

  it('só usa unidades que a tela sabe traduzir', () => {
    for (const l of LINHAS) {
      expect(UNIDADES_VALIDAS.has(l.unidade), `${l.servico} → ${l.unidade}`).toBe(true);
    }
  });

  it('respeita mínimo ≤ média ≤ máximo em todo item', () => {
    // Pega inversão de coluna e dígito trocado na transcrição.
    for (const l of LINHAS) {
      expect(l.min, `${l.servico} (folha ${l.sheet})`).toBeLessThanOrEqual(l.medio);
      expect(l.medio, `${l.servico} (folha ${l.sheet})`).toBeLessThanOrEqual(l.max);
    }
  });

  it('não tem preço negativo nem valor não numérico', () => {
    for (const l of LINHAS) {
      for (const v of [l.min, l.medio, l.max]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('todo item tem serviço e categoria preenchidos', () => {
    for (const l of LINHAS) {
      expect(l.servico.trim().length).toBeGreaterThan(0);
      expect(l.category.trim().length).toBeGreaterThan(0);
    }
  });

  it('só existe UMA linha zerada, a que o PDF publica zerada', () => {
    const zeradas = LINHAS.filter((l) => l.medio === 0);
    expect(zeradas).toHaveLength(1);
    expect(zeradas[0]!.sheet).toBe(13);
    expect(zeradas[0]!.servico).toContain('Alta espessura');
  });

  it('usa apenas as três grafias de altura que o PDF traz', () => {
    // O UPDATE que preenche `altura` casa por prefixo: grafia nova aqui
    // sairia sem altura e sumiria do filtro sem ninguém perceber.
    const alturas = new Set(
      LINHAS.map((l) => l.observacao ?? '').filter((o) => /metros/i.test(o)),
    );
    expect([...alturas].sort()).toEqual([
      'acima 3 metros',
      'acima de 3 metros',
      'até 3 metros altura',
    ]);
  });
});
