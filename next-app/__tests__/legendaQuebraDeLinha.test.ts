// Legenda respeita quebra de linha e parágrafo (2026-09-07). O relato foi
// uma descrição de obra com "Descrição:", "Artista:", "Dimensões:" em
// linhas separadas que aparecia como um bloco só: o HTML colapsa '\n' em
// espaço a menos que o CSS peça pra preservar. Teste de fonte, porque o
// PostCard tem dependências demais pra montar só por causa de um estilo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fonte = readFileSync(join(process.cwd(), 'app/feed/PostCard.tsx'), 'utf8');

function blocoQueChama(chamada: string): string {
  const i = fonte.indexOf(chamada);
  expect(i, `PostCard sem ${chamada}`).toBeGreaterThan(-1);
  // Olha o style logo antes da chamada (o bloco do container).
  return fonte.slice(Math.max(0, i - 900), i);
}

describe('PostCard — legenda e comentário preservam quebras de linha', () => {
  it('a legenda do post tem whiteSpace pre-wrap', () => {
    expect(blocoQueChama('renderRichText(post.caption)')).toMatch(/whiteSpace:\s*'pre-wrap'/);
  });

  it('o comentário também', () => {
    expect(blocoQueChama('renderRichText(c.text)')).toMatch(/whiteSpace:\s*'pre-wrap'/);
  });
});
