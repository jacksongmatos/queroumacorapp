// O portal admin (`public/portal/`) é HTML+JS estático servido pelo Next: ele
// chama as rotas de API por string, então nenhum type-check pega quando uma
// rota é renomeada. Foi assim que "Habilitar PRO"/"Promover" viraram 404 —
// o portal continuou chamando `/api/admin-users` depois que a Cloudflare
// Function virou rota Next em `/api/admin/users`.
//
// Este teste lê o fonte do portal e confere que TODA URL de API que ele chama
// tem um `route.ts` correspondente. Renomeou rota e esqueceu do portal? Fica
// vermelho aqui em vez de estourar na cara do admin.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Todos os `/api/...` citados nos JS estáticos servidos pelo Next. */
function apiUrlsIn(relPath: string): string[] {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const found = new Set<string>();
  for (const m of src.matchAll(/['"`](\/api\/[a-z0-9/_-]+)['"`]/gi)) {
    found.add(m[1]);
  }
  return [...found];
}

function routeExists(apiUrl: string): boolean {
  const dir = join(ROOT, 'app', apiUrl);
  return existsSync(join(dir, 'route.ts')) || existsSync(join(dir, 'route.tsx'));
}

const STATIC_JS = readdirSync(join(ROOT, 'public/portal')).filter((f) => f.endsWith('.js'));

describe('portal admin → rotas de API', () => {
  it('tem pelo menos um arquivo JS pra checar', () => {
    expect(STATIC_JS.length).toBeGreaterThan(0);
  });

  for (const file of STATIC_JS) {
    it(`public/portal/${file} só chama rotas que existem`, () => {
      const quebradas = apiUrlsIn(`public/portal/${file}`).filter((u) => !routeExists(u));
      expect(quebradas).toEqual([]);
    });
  }
});
