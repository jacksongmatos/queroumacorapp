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
import {
  escolherTemplate as escolherNoServidor,
  TEMPLATE_SEM_NOME,
} from '@/lib/api/_services/whatsapp';

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
  // Marcadores explícitos, não texto de comentário vizinho: em 2026-09-05
  // um componente JSX foi inserido entre o fim das funções e o comentário
  // que servia de âncora, o `new Function` quebrou no `<` e o arquivo
  // inteiro virou "skipped" — verde na contagem de testes, sem cobertura
  // nenhuma. Marcador nomeado torna o acidente visível.
  const inicio = src.indexOf('const JANELA_MS =');
  const fim = src.indexOf('// [teste:janela-fim]');
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

// ── A regra do template tem que ser a MESMA nos dois lados ───────────────
// O portal decide o que mandar quando o operador clica; o servidor decide
// sozinho no follow-up automático. Se as duas divergirem, um dos caminhos
// acaba mandando `{{1}}` vazio — e o cliente recebe "Oi ,".

let escolherNoPortal: (
  nome: string | null | undefined,
  preferido?: string
) => { template: string; nome: string | null; components?: unknown[] };

describe('escolha de template: portal e servidor concordam', () => {
  beforeAll(() => {
    const src = readFileSync(join(process.cwd(), 'public/portal/app.jsx'), 'utf8');
    const inicio = src.indexOf('const TEMPLATE_IDIOMA =');
    const fim = src.indexOf('// [teste:template-fim]');
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    const fabrica = new Function(
      `${src.slice(inicio, fim)}; return escolherTemplate;`
    ) as () => typeof escolherNoPortal;
    escolherNoPortal = fabrica();
  });

  const CASOS: Array<string | null | undefined> = [
    'Beatris Porsebon',
    'João da Silva',
    'Ângela',
    '',
    '   ',
    null,
    undefined,
    '11987654321',
    '(11) 98765-4321',
    'J Silva',
  ];

  it('escolhem o mesmo template pros mesmos nomes', () => {
    for (const nome of CASOS) {
      expect(
        { caso: nome, template: escolherNoPortal(nome).template },
        `divergiu em ${JSON.stringify(nome)}`
      ).toEqual({ caso: nome, template: escolherNoServidor(nome).template });
    }
  });

  it('extraem o mesmo primeiro nome', () => {
    for (const nome of CASOS) {
      expect(escolherNoPortal(nome).nome).toBe(escolherNoServidor(nome).nome);
    }
  });

  // O erro que a regra existe pra impedir, verificado dos dois lados.
  it('nenhum dos dois manda {{1}} vazio', () => {
    for (const nome of ['', '   ', null, undefined, '11987654321']) {
      const p = escolherNoPortal(nome);
      const sv = escolherNoServidor(nome);
      expect(p.template).toBe(TEMPLATE_SEM_NOME);
      expect(sv.template).toBe(TEMPLATE_SEM_NOME);
      expect(p.components).toBeUndefined();
      expect(sv.components).toBeUndefined();
    }
  });
});

// ── Guarda dos marcadores ────────────────────────────────────────────────
// Este arquivo lê o fonte do portal por marcador. Se alguém apagar o
// marcador, ou enfiar JSX entre eles, o `new Function` quebra e o vitest
// reporta o arquivo como SKIPPED — a contagem de testes segue verde e a
// cobertura some sem ninguém notar. Aconteceu em 2026-09-05. Este teste
// não depende da extração, então ele falha ALTO quando isso acontece.

describe('marcadores de extração do portal', () => {
  const MARCADORES = [
    '// [teste:janela-fim]',
    '// [teste:template-inicio]',
    '// [teste:template-fim]',
    'const JANELA_MS =',
    'const TEMPLATE_IDIOMA =',
  ];

  let fonte = '';
  beforeAll(() => {
    fonte = readFileSync(join(process.cwd(), 'public/portal/app.jsx'), 'utf8');
  });

  it('todos os marcadores existem', () => {
    for (const m of MARCADORES) {
      expect(fonte.includes(m), `marcador sumiu do app.jsx: ${m}`).toBe(true);
    }
  });

  it('os blocos extraídos não contêm JSX', () => {
    const blocos = [
      fonte.slice(fonte.indexOf('const JANELA_MS ='), fonte.indexOf('// [teste:janela-fim]')),
      fonte.slice(fonte.indexOf('const TEMPLATE_IDIOMA ='), fonte.indexOf('// [teste:template-fim]')),
    ];
    for (const b of blocos) {
      expect(b.length).toBeGreaterThan(50);
      // `<` seguido de letra maiúscula ou barra é abertura/fechamento de tag.
      expect(b, 'JSX dentro de um bloco que o teste avalia como JS puro').not.toMatch(/<[A-Za-z/]/);
    }
  });
});
