// runAfterResponse — mantém o worker vivo pra terminar o trabalho DEPOIS de
// a resposta já ter saído.
//
// Por que existe (2026-09-05): o webhook do WhatsApp passou a responder 200
// na hora e gravar no Supabase depois. No edge do Cloudflare o worker é
// encerrado assim que a resposta sai — uma promessa solta seria abortada no
// meio, e a mensagem sumiria sem erro nenhum. `ctx.waitUntil` é o que impede
// isso, e ele vive no mesmo símbolo global de onde `getRuntimeEnv` lê as envs.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { runAfterResponse } from '@/lib/api/env';

const CF = Symbol.for('__cloudflare-request-context__');

function comContexto(waitUntil: (p: Promise<unknown>) => void) {
  (globalThis as Record<symbol, unknown>)[CF] = { env: {}, ctx: { waitUntil } };
}

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CF];
  vi.restoreAllMocks();
});

describe('runAfterResponse', () => {
  it('entrega o trabalho ao waitUntil do worker', async () => {
    const waitUntil = vi.fn();
    comContexto(waitUntil);

    let terminou = false;
    runAfterResponse(Promise.resolve().then(() => { terminou = true; }));

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(terminou).toBe(true);
  });

  it('sem contexto (dev/vitest) roda mesmo assim, sem lançar', async () => {
    // Não há worker pra manter vivo — o trabalho simplesmente acontece.
    let terminou = false;
    expect(() =>
      runAfterResponse(Promise.resolve().then(() => { terminou = true; })),
    ).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(terminou).toBe(true);
  });

  it('trabalho que falha NÃO propaga — vira log', async () => {
    // O ponto todo: a resposta já foi enviada. Uma rejeição aqui não pode
    // virar unhandled rejection e derrubar o worker.
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const waitUntil = vi.fn();
    comContexto(waitUntil);

    runAfterResponse(Promise.reject(new Error('supabase caiu')));

    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
  });

  it('contexto sem ctx.waitUntil não quebra', () => {
    // next-on-pages nem sempre publica o ctx (build, preview de rota
    // estática). Cair pro caminho de rodar direto é o certo.
    (globalThis as Record<symbol, unknown>)[CF] = { env: {} };
    expect(() => runAfterResponse(Promise.resolve())).not.toThrow();
  });
});
