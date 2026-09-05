// Janela de 24h da Cloud API, como o PORTAL a calcula.
//
// Por que testar código do portal aqui: esta lógica decide se a tela oferece
// o campo de texto ou o botão de template — ou seja, se o operador vai
// escrever uma mensagem que a Meta recusa. Errar pra mais (dizer "aberta"
// quando está fechada) devolve 131047 na cara dele; errar pra menos esconde
// o campo sem necessidade e empurra pra um template de Marketing, que é
// cobrado por envio.
//
// O portal não tem bundler nem módulos: as funções são consts soltas num
// arquivo servido direto. Extraímos o bloco do fonte e avaliamos, que é o
// mesmo caminho do `portalApiRoutes.test.ts`.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface MsgFake {
  direction: 'in' | 'out';
  wa_timestamp?: string | null;
  created_at?: string | null;
}

let janelaAberta: (m: MsgFake[]) => boolean;
let restanteDaJanela: (m: MsgFake[]) => string | null;
let fimDaJanela: (m: MsgFake[]) => number | null;

beforeAll(() => {
  const src = readFileSync(
    join(process.cwd(), 'public/portal/app.jsx'),
    'utf8'
  );
  const inicio = src.indexOf('const JANELA_MS =');
  const fim = src.indexOf('// Previa na lista de conversas');
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);

  const bloco = src.slice(inicio, fim);
  const fabrica = new Function(
    `${bloco}; return { janelaAberta, restanteDaJanela, fimDaJanela };`
  ) as () => {
    janelaAberta: typeof janelaAberta;
    restanteDaJanela: typeof restanteDaJanela;
    fimDaJanela: typeof fimDaJanela;
  };
  ({ janelaAberta, restanteDaJanela, fimDaJanela } = fabrica());
});

afterEach(() => vi.useRealTimers());

const AGORA = new Date('2026-09-05T12:00:00Z');
const haHoras = (h: number) =>
  new Date(AGORA.getTime() - h * 3600000).toISOString();

function entrada(h: number): MsgFake {
  return { direction: 'in', created_at: haHoras(h) };
}
function saida(h: number): MsgFake {
  return { direction: 'out', created_at: haHoras(h) };
}

describe('janela de 24h (portal)', () => {
  beforeAll(() => void 0);

  it('sem histórico → fechada (é o caso da abordagem de lead)', () => {
    vi.setSystemTime(AGORA);
    expect(janelaAberta([])).toBe(false);
    expect(fimDaJanela([])).toBeNull();
  });

  it('mensagem recebida há 2h → aberta', () => {
    vi.setSystemTime(AGORA);
    expect(janelaAberta([entrada(2)])).toBe(true);
  });

  it('mensagem recebida há 25h → fechada', () => {
    vi.setSystemTime(AGORA);
    expect(janelaAberta([entrada(25)])).toBe(false);
  });

  // O ponto que mais confunde: quem abre a janela é o CLIENTE. Mandar
  // mensagem não compra mais 24h — se comprasse, dava pra conversar pra
  // sempre com quem nunca respondeu.
  it('mensagem NOSSA não abre janela, por mais recente que seja', () => {
    vi.setSystemTime(AGORA);
    expect(janelaAberta([entrada(30), saida(0)])).toBe(false);
  });

  it('vale a mensagem recebida MAIS RECENTE, não a primeira', () => {
    vi.setSystemTime(AGORA);
    expect(janelaAberta([entrada(40), entrada(1)])).toBe(true);
    expect(janelaAberta([entrada(1), entrada(40)])).toBe(true);
  });

  it('usa wa_timestamp quando existe (relógio da Meta, não o nosso)', () => {
    vi.setSystemTime(AGORA);
    // created_at antigo, wa_timestamp recente: vale o da Meta.
    expect(
      janelaAberta([
        { direction: 'in', wa_timestamp: haHoras(1), created_at: haHoras(50) },
      ])
    ).toBe(true);
  });

  it('data inválida não vira janela aberta', () => {
    vi.setSystemTime(AGORA);
    expect(janelaAberta([{ direction: 'in', created_at: 'não é data' }])).toBe(false);
    expect(janelaAberta([{ direction: 'in', created_at: null }])).toBe(false);
  });

  it('exatamente 24h → fechada (a borda não conta a favor)', () => {
    vi.setSystemTime(AGORA);
    expect(janelaAberta([entrada(24)])).toBe(false);
  });

  it('restante é legível e some quando fecha', () => {
    vi.setSystemTime(AGORA);
    expect(restanteDaJanela([entrada(2)])).toBe('22h');
    expect(restanteDaJanela([entrada(23.5)])).toBe('30min');
    expect(restanteDaJanela([entrada(25)])).toBeNull();
    expect(restanteDaJanela([])).toBeNull();
  });
});
