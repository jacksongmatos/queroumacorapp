// Regressão do pull-to-refresh no Android (2026-08-22).
//
// Sintoma relatado: "não consigo rolar a tela para cima, quando tento
// aparece o logo de reload". Não era layout — era o pull-to-refresh do
// Chromium. O app rola dentro do `<main>` do AppShell; ao chegar no topo,
// o gesto ENCADEAVA no scroller raiz e virava recarregamento de página, o
// que jogava a pessoa de volta ao topo e parecia scroll travado.
//
// Os testes leem o FONTE (vitest roda em `environment: 'node'`, sem CSSOM)
// e travam as duas metades da correção: a raiz e o scroller interno.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const appShell = readFileSync(join(root, 'components/AppShell.tsx'), 'utf8');

/** Remove comentários /* … *​/ pra não casar com o texto explicativo. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('pull-to-refresh (overscroll)', () => {
  it('globals.css contém o overscroll vertical na raiz', () => {
    const rules = stripComments(css);
    const block = rules.match(/html,\s*body\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/overscroll-behavior-y:\s*(contain|none)/);
  });

  it('o <main> do AppShell não encadeia o gesto no scroller raiz', () => {
    const code = stripComments(appShell.replace(/\/\/.*$/gm, ''));
    expect(code).toMatch(/overscrollBehaviorY:\s*'(contain|none)'/);
  });

  it('a raiz do AppShell continua sem scroll próprio (100dvh + hidden)', () => {
    // Se a raiz voltar a rolar, o pull-to-refresh volta junto: o `contain`
    // do <main> só protege enquanto ele for o único scroller da tela.
    expect(appShell).toMatch(/overflow-hidden/);
    expect(appShell).toMatch(/height:\s*'100dvh'/);
  });

  it('não trava o scroll com overflow:hidden no body', () => {
    // O tour usa scrollIntoView; travar o body mataria o scroll programático.
    const rules = stripComments(css);
    expect(rules).not.toMatch(/body\s*\{[^}]*overflow:\s*hidden/);
  });
});
