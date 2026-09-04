// Regressão do 401 "Faça login" em TODA a IA (2026-09-04).
//
// O servidor tira o token só do header `Authorization: Bearer` ou de
// `accessToken` no corpo — não há fallback de cookie. Depois do fix C1
// (anônimo virou 401), os serviços de IA continuaram chamando SEM token, e
// toda rota protegida respondia 401. Estes testes falham se o header sumir
// de novo.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const refreshSession = vi.fn();
vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ auth: { getSession, refreshSession } }),
}));

import { authHeaders } from '../../lib/services/authHeaders';

describe('authHeaders', () => {
  beforeEach(() => {
    getSession.mockReset();
    refreshSession.mockReset();
  });

  it('manda Bearer com o access_token da sessão', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    await expect(authHeaders()).resolves.toEqual({ Authorization: 'Bearer tok-123' });
  });

  it('sem sessão devolve objeto vazio (rota responde 401, não pior)', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(authHeaders()).resolves.toEqual({});
  });

  it('nunca lança quando getSession falha', async () => {
    getSession.mockRejectedValue(new Error('offline'));
    await expect(authHeaders()).resolves.toEqual({});
  });
});

describe('serviços de IA enviam o token', () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } });
  });

  it('sendChatMessage manda Authorization no /api/chat-ai', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'oi' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendChatMessage } = await import('../../lib/services/aiChat');
    await sendChatMessage([], 'oi');

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer tok-abc');
    vi.unstubAllGlobals();
  });

  it('transcribeAudio (multipart) manda Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'texto' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { transcribeAudio } = await import('../../lib/services/aiChat');
    await transcribeAudio(new Blob(['x'], { type: 'audio/webm' }));

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer tok-abc');
    vi.unstubAllGlobals();
  });
});

// ── Renovação no 401 (sessão rotacionada) ────────────────────────────────
// `token_invalid` observado em produção: o GoTrue recusa o token enquanto o
// PostgREST ainda aceita. O remédio é renovar a sessão UMA vez e repetir.
describe('fetchGated — renova a sessão no 401', () => {
  beforeEach(() => {
    getSession.mockReset();
    refreshSession.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: 'velho' } } });
  });

  it('no 401 renova e REPETE a chamada', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true });
    vi.stubGlobal('fetch', fetchMock);
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo' } } });

    const { fetchGated } = await import('../../lib/services/fetchGated');
    const res = await fetchGated('/api/chat-ai', { method: 'POST' });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    vi.unstubAllGlobals();
  });

  it('se a renovação falhar, devolve o 401 original (sem laço)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, ok: false });
    vi.stubGlobal('fetch', fetchMock);
    refreshSession.mockResolvedValue({ data: { session: null } });

    const { fetchGated } = await import('../../lib/services/fetchGated');
    const res = await fetchGated('/api/chat-ai', { method: 'POST' });

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('resposta OK não dispara renovação', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchGated } = await import('../../lib/services/fetchGated');
    await fetchGated('/api/chat-ai', { method: 'POST' });

    expect(refreshSession).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
