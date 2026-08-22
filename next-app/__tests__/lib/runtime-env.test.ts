// No edge do Cloudflare Pages os secrets do painel NÃO chegam em
// `process.env` — só existem no request context, publicado no symbol global
// `Symbol.for('__cloudflare-request-context__')`. Isso foi descoberto
// depurando o portal admin em produção (403 e 503 em toda rota admin).
//
// Estes testes prendem as duas metades da lição: ler do symbol quando ele
// existe, e cair pro process.env quando não existe (build, dev, vitest).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getRuntimeEnv, getSupabaseServiceKey } from '@/lib/api/env';
import { isAdminEmail, __resetAdminEmailsCacheForTests } from '@/lib/api/admin-config';

const CTX = Symbol.for('__cloudflare-request-context__');
const g = globalThis as Record<symbol, unknown>;

function comContextoCloudflare(env: Record<string, unknown>) {
  g[CTX] = { env };
}

beforeEach(() => {
  delete g[CTX];
  delete process.env.CHAVE_DE_TESTE;
});
afterEach(() => {
  delete g[CTX];
  delete process.env.CHAVE_DE_TESTE;
});

describe('getRuntimeEnv', () => {
  it('lê do request context do Cloudflare quando ele existe', () => {
    comContextoCloudflare({ CHAVE_DE_TESTE: 'do-edge' });
    expect(getRuntimeEnv('CHAVE_DE_TESTE')).toBe('do-edge');
  });

  it('o request context tem prioridade sobre process.env', () => {
    process.env.CHAVE_DE_TESTE = 'do-process';
    comContextoCloudflare({ CHAVE_DE_TESTE: 'do-edge' });
    expect(getRuntimeEnv('CHAVE_DE_TESTE')).toBe('do-edge');
  });

  it('cai pro process.env fora de um request (build, dev, testes)', () => {
    process.env.CHAVE_DE_TESTE = 'do-process';
    expect(getRuntimeEnv('CHAVE_DE_TESTE')).toBe('do-process');
  });

  it('chave ausente nos dois lugares → undefined', () => {
    comContextoCloudflare({ OUTRA: 'x' });
    expect(getRuntimeEnv('CHAVE_DE_TESTE')).toBeUndefined();
  });

  it('contexto sem `env` não quebra', () => {
    g[CTX] = {};
    process.env.CHAVE_DE_TESTE = 'do-process';
    expect(getRuntimeEnv('CHAVE_DE_TESTE')).toBe('do-process');
  });

  it('os helpers nomeados passam pelo mesmo caminho', () => {
    comContextoCloudflare({ SUPABASE_SERVICE_ROLE_KEY: 'chave-service' });
    expect(getSupabaseServiceKey()).toBe('chave-service');
  });
});

describe('isAdminEmail — leitura preguiçosa', () => {
  it('enxerga ADMIN_EMAILS que só apareceu DEPOIS do module-load', () => {
    // É o caso do edge: no boot não existe request, então não existe env.
    // Com o parse no module-load, o cache nascia vazio e todo admin virava
    // "não autorizado".
    __resetAdminEmailsCacheForTests({ raw: '' });
    expect(isAdminEmail('dono@calicolors.com.br')).toBe(false);

    comContextoCloudflare({ ADMIN_EMAILS: 'dono@calicolors.com.br' });
    __resetAdminEmailsCacheForTests();
    expect(isAdminEmail('dono@calicolors.com.br')).toBe(true);
    expect(isAdminEmail('DONO@CaliColors.com.BR')).toBe(true);
    expect(isAdminEmail('estranho@gmail.com')).toBe(false);
  });
});
