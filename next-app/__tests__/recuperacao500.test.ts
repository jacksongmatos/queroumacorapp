// @vitest-environment jsdom
//
// A CADEIA INTEIRA de recuperação do "500 | Server Error", ponta a ponta.
//
// Os testes que existiam cobriam os elos separados. Este cobre a corrente:
//
//   1. o fetch do payload RSC volta 5xx  →  o SW entrega 503 SEM CORPO
//      (era aqui que a corrente arrebentava: o SW devolvia o 500 cru, o
//       runtime do Next pintava a própria tela de erro e, como nunca houve
//       navegação de documento, nenhuma defesa rodava — a lápide que só
//       saía reiniciando o app);
//   2. o router descarta e faz hard-nav  →  vira navegação de DOCUMENTO;
//   3. o documento também volta 5xx      →  o SW entrega a página
//      "Reconectando…";
//   4. essa página SE RECARREGA SOZINHA — e é este último elo que nunca
//      tinha sido verificado. Aqui o script inline é de fato EXECUTADO.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SW_SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf-8');
const ORIGIN = 'https://queroumacor.com.br';

/** Roda o sw.js num escopo falso e devolve o handler de fetch. */
function carregarSw(respostas: Map<string, Array<Response | 'network-error'>>) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const cacheVazio = {
    put: async () => {},
    match: async () => undefined,
    keys: async () => [],
    delete: async () => false,
  };
  const escopo = {
    self: null as unknown,
    addEventListener: (t: string, h: (e: unknown) => void) => {
      handlers[t] = h;
    },
    location: { origin: ORIGIN },
    caches: { open: async () => cacheVazio, keys: async () => [], delete: async () => true },
    clients: { claim: async () => {}, matchAll: async () => [] },
    skipWaiting: async () => {},
    registration: {},
    fetch: async (req: Request | string) => {
      const url = typeof req === 'string' ? req : req.url;
      const fila = respostas.get(url.split('#')[0]);
      const prox = fila?.shift();
      if (!prox) return new Response('ok', { status: 200 });
      if (prox === 'network-error') throw new TypeError('Failed to fetch');
      return prox;
    },
  };
  escopo.self = escopo;
  const fn = new Function(
    'self', 'addEventListener', 'location', 'caches', 'clients',
    'skipWaiting', 'registration', 'fetch',
    SW_SOURCE,
  );
  fn(escopo, escopo.addEventListener, escopo.location, escopo.caches, escopo.clients,
     escopo.skipWaiting, escopo.registration, escopo.fetch);

  return async (req: Request): Promise<Response> => {
    let resposta: Promise<Response> | null = null;
    handlers.fetch?.({ request: req, respondWith: (p: Promise<Response>) => { resposta = p; }, waitUntil: () => {} });
    return resposta ? await resposta : new Response('sem handler', { status: 599 });
  };
}

/**
 * O `Request` do jsdom recusa `mode: 'navigate'` (só o browser constrói
 * assim). Um Proxy entrega os dois campos que o SW consulta pra reconhecer
 * navegação de documento — mesmo truque do `sw.test.ts`.
 */
function comoNavegacao(req: Request): Request {
  return new Proxy(req, {
    get(alvo, prop, receiver) {
      if (prop === 'mode') return 'navigate';
      if (prop === 'destination') return 'document';
      return Reflect.get(alvo, prop, receiver);
    },
  }) as Request;
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('recuperação do 500 — a corrente inteira', () => {
  it('elo 1: RSC com 5xx vira 503 SEM CORPO (nunca o 500 cru)', async () => {
    const rsc = `${ORIGIN}/feed?_rsc=x`;
    const handle = carregarSw(
      new Map([[rsc, [new Response('flight', { status: 500 }), new Response('flight', { status: 500 })]]]),
    );
    const res = await handle(new Request(rsc));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('');
  });

  it('elo 3: o documento com 5xx recebe a página "Reconectando…"', async () => {
    const doc = `${ORIGIN}/feed`;
    const handle = carregarSw(
      new Map([[doc, [new Response('erro', { status: 500 }), new Response('erro', { status: 500 })]]]),
    );
    const res = await handle(comoNavegacao(new Request(doc)));
    const html = await res.text();
    expect(html).toContain('Reconectando');
    // E NÃO a tela padrão do Next, que é o que a pessoa via.
    expect(html).not.toContain('next-error-h1');
  });

  it('elo 4: a página entregue se RECARREGA sozinha (script executado)', async () => {
    const doc = `${ORIGIN}/feed`;
    const handle = carregarSw(
      new Map([[doc, [new Response('erro', { status: 500 }), new Response('erro', { status: 500 })]]]),
    );
    const html = await (await handle(comoNavegacao(new Request(doc)))).text();

    // Executa de verdade o <script> inline que veio na resposta.
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(script, 'a página de recuperação precisa trazer o script inline').toBeTruthy();

    const recarregou = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: recarregou, href: `${ORIGIN}/feed` },
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
    new Function(script as string)();

    // Nada de reload imediato — laço de reload gastaria bateria.
    expect(recarregou).not.toHaveBeenCalled();
    // E dentro da janela de backoff, ele tenta sozinho.
    vi.advanceTimersByTime(10_000);
    expect(recarregou).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('elo 4b: o freio existe — não recarrega pra sempre', async () => {
    const doc = `${ORIGIN}/feed`;
    const handle = carregarSw(
      new Map([[doc, [new Response('e', { status: 500 }), new Response('e', { status: 500 })]]]),
    );
    const html = await (await handle(comoNavegacao(new Request(doc)))).text();
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] as string;

    const recarregou = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: recarregou, href: `${ORIGIN}/feed` },
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
    // O freio é "no máximo 6 em 2 minutos". O teste tem que caber DENTRO da
    // janela: 8 × 12s = 96s. Com 20s por tentativa a janela virava no meio e
    // o contador reiniciava — legitimamente, mas invalidando a medida (foi o
    // que a 1ª versão deste teste errou).
    // 12s também cobre o maior backoff da série (2,5s + 6×1,5s = 11,5s),
    // então toda tentativa agendada chega a disparar.
    for (let i = 0; i < 8; i++) {
      new Function(script)();
      vi.advanceTimersByTime(12_000);
    }
    expect(recarregou.mock.calls.length).toBeLessThanOrEqual(6);
    // E tentou de verdade — um freio que trava tudo em zero não serve.
    expect(recarregou.mock.calls.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});
