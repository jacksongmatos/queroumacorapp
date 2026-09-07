// O catálogo de especialidades do PORTAL tem que ser o mesmo do APP.
//
// Contexto (07/09/2026): no portal, especialidade era um `prompt()` de texto
// livre. Digitado à mão, o mesmo item entrava como "Piso Epoxi", "piso epoxi"
// e "Piso Epóxi" — três valores diferentes pro filtro da busca do app, que
// compara string. Virou lista de checkbox; e como o portal é um arquivo único
// sem imports, a lista está DUPLICADA lá.
//
// Duplicata sem verificação é duplicata que diverge (a lição do isVideoPost e
// da lista de "quem é profissional"). Este teste lê o fonte do portal e
// compara com o ROLE_SPECS do app: mexeu num, tem que mexer no outro.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_SPECS } from '@/lib/services/profile';

const FONTE = join(__dirname, '..', 'public', 'portal', 'app.jsx');

/** Extrai o objeto `PERFIL_SPECS` do fonte do portal. */
function specsDoPortal(): Record<string, string[]> {
  const src = readFileSync(FONTE, 'utf8');
  const ini = src.indexOf('const PERFIL_SPECS = {');
  expect(ini, 'PERFIL_SPECS sumiu do portal').toBeGreaterThan(-1);
  const fim = src.indexOf('\n};', ini);
  expect(fim, 'não achei o fim do PERFIL_SPECS').toBeGreaterThan(ini);
  const corpo = src.slice(ini + 'const PERFIL_SPECS = '.length, fim + 2);
  return new Function(`return ${corpo}`)() as Record<string, string[]>;
}

describe('catálogo de especialidades: portal × app', () => {
  it('os dois têm exatamente os mesmos papéis', () => {
    expect(Object.keys(specsDoPortal()).sort()).toEqual(
      Object.keys(ROLE_SPECS).sort(),
    );
  });

  it('cada papel tem a mesma lista, na mesma ordem', () => {
    const portal = specsDoPortal();
    for (const [papel, lista] of Object.entries(ROLE_SPECS)) {
      expect(portal[papel], `papel ${papel}`).toEqual([...lista]);
    }
  });

  it('o portal não voltou a pedir especialidade por texto livre', () => {
    const src = readFileSync(FONTE, 'utf8');
    // `prompt()` de especialidade era exatamente o que enchia o banco de
    // variação. Se voltar, este teste denuncia.
    expect(src).not.toMatch(/prompt\(\s*\n?\s*'Especialidades/);
    expect(src).toContain("type=\"checkbox\"");
  });
});
