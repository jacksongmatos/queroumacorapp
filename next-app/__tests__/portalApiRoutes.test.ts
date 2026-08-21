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
import { createHash } from 'node:crypto';
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

// Inclui o `.jsx`: ele é o FONTE do `app.js` compilado. Corrigir só o
// compilado faz a correção sumir na próxima compilação.
const STATIC_JS = readdirSync(join(ROOT, 'public/portal')).filter(
  (f) => f.endsWith('.js') || f.endsWith('.jsx'),
);

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

// ─────────────────────────────────────────────────────────────────────────────
// Subresource Integrity: o index.html do portal carrega os scripts com
// `integrity="sha384-…"`. Se o arquivo muda e o hash não, o navegador se
// RECUSA a executar o script — sem erro visível na tela, o portal fica
// eternamente em "Carregando Portal Cali Colors…". Foi o que aconteceu ao
// corrigir a URL da API dentro do app.js.

const INDEX_HTML = readFileSync(join(ROOT, 'public/portal/index.html'), 'utf8');

/** `[src, hash]` de cada <script> local com integrity no index do portal. */
function localScriptsWithIntegrity(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const tag of INDEX_HTML.match(/<script\b[^>]*>/g) ?? []) {
    const src = tag.match(/src="([^"]+)"/)?.[1];
    const integrity = tag.match(/integrity="(sha384-[^"]+)"/)?.[1];
    // Só os servidos por nós; CDN externo não temos como conferir aqui.
    if (src && integrity && src.startsWith('/')) out.push([src, integrity]);
  }
  return out;
}

function sriOf(relPath: string): string {
  const buf = readFileSync(join(ROOT, 'public', relPath));
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}

describe('portal admin → integrity dos scripts', () => {
  const scripts = localScriptsWithIntegrity();

  it('o index.html declara integrity nos scripts locais', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  for (const [src, integrity] of scripts) {
    const file = src.split('?')[0];
    it(`${file} bate com o hash declarado no index.html`, () => {
      expect(existsSync(join(ROOT, 'public', file))).toBe(true);
      expect(sriOf(file)).toBe(integrity);
    });
  }
});
