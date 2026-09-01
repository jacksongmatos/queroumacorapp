// admin-config.ts — cache de `ADMIN_EMAILS`, preenchido na PRIMEIRA chamada
// de `isAdminEmail` (não no module-load).
//
// Motivação (R-H6 do REMEDIATION_PLAN):
//   - `security.ts` parseava `ADMIN_EMAILS` a cada chamada de `isAdminEmail`,
//     o que é desperdício (rota admin chama N vezes por request). Caching
//     aqui transforma `isAdminEmail` em `Set.has` O(1) e centraliza a
//     parsing/validação.
//
// Por que preguiçoso e não no module-load: no edge do Cloudflare Pages as
// variáveis de ambiente só existem DENTRO de um request handler — no
// module-load não há contexto de request pra ler. Com o parse no boot, o
// cache nascia sempre vazio e `isAdminEmail()` respondia false pra todo
// mundo; era exatamente o 403 "não autorizado (email não admin)" que o
// portal dava. Ver `getRuntimeEnv` em `./env`.
//
// Formato esperado: comma-separated, com ou sem espaços. Entradas
// inválidas (sem `@` ou sem TLD) são ignoradas com warn — preferimos
// degradar a alguns admins do que perder o resto da lista por causa de
// um typo.
//
// Não é necessário refresh em runtime: env vars do edge runtime são
// imutáveis por cold-start. Quando o operador roda re-deploy com nova
// lista, novos edge workers leem a versão nova.

import { getRuntimeEnv } from './env';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAdminEmails(): Set<string> {
  const raw = (getRuntimeEnv('ADMIN_EMAILS') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = raw.filter((e) => EMAIL_RE.test(e));
  const invalid = raw.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length > 0) {
    console.warn(
      '[admin-config] ADMIN_EMAILS contém entradas inválidas (ignoradas):',
      invalid,
    );
  }
  return new Set(valid);
}

let ADMIN_EMAILS_CACHE: Set<string> | null = null;

/**
 * Preenche o cache na primeira chamada. O aviso de misconfig sai daqui (e
 * não do module-load) pelo mesmo motivo do parse: no edge, é dentro do
 * request que dá pra saber se a env existe. Loga uma vez só — throw
 * derrubaria TODO request edge, e um Set vazio (= nenhum admin via env) é
 * melhor que downtime total. Em vitest o aviso é suprimido.
 */
function getCache(): Set<string> {
  if (ADMIN_EMAILS_CACHE) return ADMIN_EMAILS_CACHE;
  ADMIN_EMAILS_CACHE = parseAdminEmails();
  if (
    process.env.NODE_ENV === 'production' &&
    ADMIN_EMAILS_CACHE.size === 0 &&
    process.env.VITEST !== 'true' &&
    !process.env.VITEST_WORKER_ID
  ) {
    console.error(
      '[admin-config] ADMIN_EMAILS ausente/vazio em produção — ' +
        'nenhum email será reconhecido como admin via env. Painéis admin ' +
        'continuam acessíveis pra profiles.portal_access=true (auth-server).',
    );
  }
  return ADMIN_EMAILS_CACHE;
}

/**
 * Checa se `email` está em `ADMIN_EMAILS` (case-insensitive). O(1) depois
 * da primeira chamada.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getCache().has(email.toLowerCase());
}

/**
 * Resetar cache para testes. Uso:
 *   __resetAdminEmailsCacheForTests({ raw: 'a@b.co,c@d.co' });
 *
 * Sem `raw` apenas re-lê `ADMIN_EMAILS` atual.
 */
export function __resetAdminEmailsCacheForTests(opts?: { raw?: string }): void {
  // Helper de teste: escreve em `process.env` mesmo — é de onde o
  // `getRuntimeEnv` lê fora de um request do Cloudflare.
  if (opts?.raw !== undefined) process.env.ADMIN_EMAILS = opts.raw;
  ADMIN_EMAILS_CACHE = parseAdminEmails();
}
