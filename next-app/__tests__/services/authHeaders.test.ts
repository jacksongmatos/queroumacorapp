// Regressão do 401 "Faça login" em TODA a IA (2026-09-04).
//
// O servidor tira o token só do header `Authorization: Bearer` ou de
// `accessToken` no corpo — não há fallback de cookie. Depois do fix C1
// (anônimo virou 401), os serviços de IA continuaram chamando SEM token, e
// toda rota protegida respondia 401. Estes testes falham se o header sumir
// de novo.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

import { authHeaders } from '../../lib/services/authHeaders';

describe('authHeaders', () => {
  beforeEach(() => {
    getSession.mockReset();
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
