// gate-anon.test.ts — regressão do FIX C1 (auditoria 2026-08-26).
//
// Antes do fix, `requireAuth` fail-open + `requirePro(undefined)→{pro:true}`
// + `checkRateLimit` skipped sem userId deixavam requisição SEM TOKEN
// atravessar `gateProAI`/`gateProAIForm` inteiros e chegar na IA — sem auth,
// sem PRO, sem rate limit, sem cota. Estes testes travam o comportamento
// correto: anônimo (e token inválido) = 401 ANTES de qualquer custo.

import { afterEach, describe, expect, it } from 'vitest';
import { gateProAI, gateProAIForm, ERR_LOGIN_REQUIRED } from '../../lib/api/security';
import { installAuthMocks, type InstalledMocks } from './_helpers';

let mocks: InstalledMocks | null = null;
afterEach(() => {
  mocks?.restore();
  mocks = null;
});

function req(body?: unknown): Request {
  return new Request('https://queroumacor.com.br/api/chat-ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('gateProAI — FIX C1: anônimo nunca passa', () => {
  it('sem token nenhum → 401 (não 200, não skipped)', async () => {
    mocks = installAuthMocks();
    const res = await gateProAI(req({ message: 'oi' }), { accessToken: undefined }, {
      endpoint: 'chat-ai',
    });
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(401);
    const json = await r.json();
    expect(json.error).toBe(ERR_LOGIN_REQUIRED);
  });

  it('token inválido → 401', async () => {
    mocks = installAuthMocks({ unauth: true });
    const res = await gateProAI(req(), { accessToken: 'token-podre' }, {
      endpoint: 'chat-ai',
    });
    expect((res as Response).status).toBe(401);
  });

  it('anônimo é barrado ANTES do check de PRO e do rate limit (zero custo)', async () => {
    mocks = installAuthMocks();
    await gateProAI(req(), {}, { endpoint: 'chat-ai' });
    const urls = mocks.calls.map((c) => c.url);
    expect(urls.some((u) => u.includes('/rest/v1/profiles'))).toBe(false);
    expect(urls.some((u) => u.includes('check_rate_limit'))).toBe(false);
  });

  it('token válido segue passando (sanidade — fix não pode barrar logado)', async () => {
    mocks = installAuthMocks({ pro: true });
    const res = await gateProAI(req(), { accessToken: 'token-bom' }, {
      endpoint: 'chat-ai',
    });
    expect(res).not.toBeInstanceOf(Response);
    expect((res as { userId: string }).userId).toBe('user-test-id');
  });
});

describe('gateProAIForm — FIX C1: mesmo contrato no multipart', () => {
  it('FormData sem accessToken → 401', async () => {
    mocks = installAuthMocks();
    const fd = new FormData();
    fd.set('file', new Blob(['x'], { type: 'image/png' }), 'x.png');
    const res = await gateProAIForm(req(), fd, { endpoint: 'caption' });
    expect((res as Response).status).toBe(401);
    expect((await (res as Response).json()).error).toBe(ERR_LOGIN_REQUIRED);
  });

  it('FormData com token válido passa', async () => {
    mocks = installAuthMocks({ pro: true });
    const fd = new FormData();
    fd.set('accessToken', 'token-bom');
    const res = await gateProAIForm(req(), fd, { endpoint: 'caption' });
    expect(res).not.toBeInstanceOf(Response);
  });
});
