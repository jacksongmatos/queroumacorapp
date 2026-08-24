// Scroller aninhado dentro de um BottomSheet (2026-08-24).
//
// O BottomSheet já é `maxHeight: 92dvh` com cabeçalho fixo + corpo rolável.
// Quem coloca um SEGUNDO scroller dimensionado em unidade de viewport
// (`vh`/`dvh`) dentro dele cria uma caixa que cobre toda a área visível — e
// o iOS prende o gesto a UM scroller do começo ao fim, sem encadear no pai.
// Resultado: o que estiver DEPOIS dessa caixa (tipicamente o botão de ação)
// fica inalcançável, porque não sobra pedaço do corpo do sheet pra encostar
// o dedo. Foi o que aconteceu com o "Enviar orçamento" do OrcamentoSheet.
//
// Scroller aninhado com altura FIXA em px continua permitido: ele não toma a
// tela inteira, então sempre sobra corpo do sheet pra rolar (é o caso da
// lista de cores do ProductDetailSheet, `maxHeight: 220`).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';

const root = join(__dirname, '..');

function sourceFiles(): string[] {
  return globSync('{app,components}/**/*.tsx', { cwd: root }).map((f) => join(root, f));
}

/** Arquivos que renderizam um <BottomSheet> — só neles a regra vale. */
function sheetFiles(): { path: string; code: string }[] {
  return sourceFiles()
    .map((path) => ({ path, code: readFileSync(path, 'utf8') }))
    .filter(({ code }) => code.includes('<BottomSheet'));
}

/** `maxHeight: '60vh'` / `max-h-[70dvh]` e variantes. */
const VIEWPORT_HEIGHT = /max(?:Height|-h)[^\n]{0,40}\d+(?:vh|dvh)/;
const IS_SCROLLER = /overflowY:\s*'(auto|scroll)'|overflow-y-(auto|scroll)/;

describe('BottomSheet: sem scroller aninhado de altura de viewport', () => {
  it('encontra os sheets pra checar', () => {
    expect(sheetFiles().length).toBeGreaterThan(0);
  });

  it.each(sheetFiles().map((f) => f.path))('%s', (path) => {
    const code = readFileSync(path, 'utf8');
    // Casa a linha do scroller com a da altura na MESMA declaração de style.
    const offenders = code
      .split(/\}\s*\}/)
      .filter((chunk) => IS_SCROLLER.test(chunk) && VIEWPORT_HEIGHT.test(chunk));
    expect(offenders).toEqual([]);
  });

  it('OrcamentoSheet deixa o botão de enviar no mesmo scroller dos campos', () => {
    const code = readFileSync(join(root, 'components/OrcamentoSheet.tsx'), 'utf8');
    expect(code).not.toMatch(IS_SCROLLER);
    expect(code).toContain('Enviar orçamento');
  });
});
