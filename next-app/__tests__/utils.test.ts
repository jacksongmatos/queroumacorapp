// Tests do port lib/utils.ts (helpers puros).
// Cobre as funções migradas de /utils.js — DOM-bound (toast, showModal,
// fmtBRL como mutator de input, etc.) NÃO foram portadas, então não há
// teste pra elas aqui (vão pra componentes/hooks numa próxima fase).

import { describe, it, expect, vi } from 'vitest';
import {
  parseBRL,
  ymdBrt,
  ymdDeCampos,
  fmtBRL,
  escapeHtml,
  escapeJsArg,
  getTimeAgo,
  stripEmail,
  cleanHandle,
  isVideoUrl,
  crmNormName,
  crmMonthsSince,
  hashStr,
  normTxt,
  starStr,
  agYmd,
  throttle,
} from '../lib/utils';

// A2 (01/09/2026): "hoje" era calculado com `getTimezoneOffset()`, ou seja,
// pelo fuso do APARELHO — enquanto o app exibe tudo em Brasília (o patch do
// layout cobre só `toLocale*String`). Fora do fuso de São Paulo isso
// deslocava o destaque de "hoje" na agenda, o recorte do dia no Financeiro e
// a data de follow-up do pipeline.
describe('utils — datas em Brasília', () => {
  it('ymdBrt devolve o dia em SÃO PAULO, não em UTC', () => {
    // 2026-09-02T02:00Z já é dia 2 em UTC, mas ainda é dia 1 em Brasília
    // (UTC−3): é a virada que produzia o dia errado.
    expect(ymdBrt(new Date('2026-09-02T02:00:00Z'))).toBe('2026-09-01');
  });

  it('ymdBrt vira o dia às 03:00Z (meia-noite em Brasília)', () => {
    expect(ymdBrt(new Date('2026-09-02T02:59:59Z'))).toBe('2026-09-01');
    expect(ymdBrt(new Date('2026-09-02T03:00:00Z'))).toBe('2026-09-02');
  });

  it('ymdBrt não depende do fuso de quem roda o teste', () => {
    // O instante é absoluto; o resultado é sempre o dia em São Paulo.
    expect(ymdBrt(new Date(Date.UTC(2026, 0, 1, 12, 0, 0)))).toBe('2026-01-01');
  });

  it('ymdDeCampos formata o Date pelos CAMPOS, sem passar por fuso', () => {
    // Limite de mês do grid da agenda: ano/mês já são números de calendário.
    expect(ymdDeCampos(new Date(2026, 8, 1))).toBe('2026-09-01');
    expect(ymdDeCampos(new Date(2026, 11, 31))).toBe('2026-12-31');
    // Overflow de dezembro → janeiro, que a agenda usa pro fim do range.
    expect(ymdDeCampos(new Date(2026, 12, 1))).toBe('2027-01-01');
  });
});

describe('utils — parseBRL/fmtBRL', () => {
  it('parseBRL trata "1.500,50" como 1500.5', () => {
    expect(parseBRL('1.500,50')).toBeCloseTo(1500.5);
  });
  // Regressão do bug de 01/09/2026: o decimal com PONTO multiplicava por 100.
  // O teclado do Android (inputMode="decimal") oferece ponto, então isto não
  // era caso de canto — era o caminho comum de quem digita preço no celular.
  it('parseBRL trata ponto como DECIMAL quando sobram 1-2 casas', () => {
    expect(parseBRL('1500.50')).toBeCloseTo(1500.5);
    expect(parseBRL('0.99')).toBeCloseTo(0.99);
    expect(parseBRL('12.5')).toBeCloseTo(12.5);
  });

  it('parseBRL trata ponto como MILHAR quando sobram 3 casas (uso pt-BR)', () => {
    expect(parseBRL('1.500')).toBe(1500);
    expect(parseBRL('1.234.567')).toBe(1234567);
  });

  it('parseBRL: vírgula sempre manda, ponto vira milhar', () => {
    expect(parseBRL('1500,50')).toBeCloseTo(1500.5);
    expect(parseBRL('1.500,50')).toBeCloseTo(1500.5);
    expect(parseBRL('1.234.567,89')).toBeCloseTo(1234567.89);
  });

  it('parseBRL: número entra direto (String() quebrava o decimal)', () => {
    expect(parseBRL(1500.5)).toBeCloseTo(1500.5);
    expect(parseBRL(0.99)).toBeCloseTo(0.99);
    expect(parseBRL(Infinity)).toBe(0);
  });

  it('parseBRL ignora símbolo de moeda e espaços', () => {
    expect(parseBRL('R$ 1.500,50')).toBeCloseTo(1500.5);
    expect(parseBRL('R$ 89,90')).toBeCloseTo(89.9);
  });

  it('parseBRL: parte inteira zerada mantém o ponto como decimal', () => {
    expect(parseBRL('0.999')).toBeCloseTo(0.999);
  });

  it('parseBRL devolve 0 pra vazio/null', () => {
    expect(parseBRL('')).toBe(0);
    expect(parseBRL(null)).toBe(0);
  });
  it('parseBRL aceita number direto', () => {
    expect(parseBRL(42)).toBe(42);
  });
  it('fmtBRL formata em pt-BR', () => {
    expect(fmtBRL(1500.5)).toBe('1.500,50');
  });
  it('fmtBRL devolve "" para negativo (sentinel)', () => {
    expect(fmtBRL(-1)).toBe('');
  });
});

describe('utils — escapeHtml / escapeJsArg', () => {
  it('escapeHtml escapa todas as 5 entidades', () => {
    expect(escapeHtml('<b>"x"</b> & \'y\'')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;');
  });
  it('escapeJsArg remove < > e escapa aspas', () => {
    const out = escapeJsArg(`it's <bad>`);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain("\\'");
  });
});

describe('utils — getTimeAgo', () => {
  it('< 1min → AGORA', () => {
    expect(getTimeAgo(new Date().toISOString())).toBe('AGORA');
  });
  it('1h atrás → "HA 1 HORA"', () => {
    const d = new Date(Date.now() - 60 * 60 * 1000);
    expect(getTimeAgo(d.toISOString())).toBe('HA 1 HORA');
  });
  it('2 dias atrás → "HA 2 DIAS"', () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(getTimeAgo(d.toISOString())).toBe('HA 2 DIAS');
  });
});

describe('utils — stripEmail / cleanHandle', () => {
  it('stripEmail substitui @dominio por @local', () => {
    expect(stripEmail('joao@gmail.com fala com maria@yahoo.com.br')).toBe('@joao fala com @maria');
  });
  it('cleanHandle prioriza tag', () => {
    expect(cleanHandle({ tag: 'joao', name: 'João' })).toBe('@joao');
    expect(cleanHandle({ name: 'João' })).toBe('João');
    expect(cleanHandle(null, 'Anônimo')).toBe('Anônimo');
  });
});

describe('utils — isVideoUrl', () => {
  it('detecta extensões de vídeo', () => {
    expect(isVideoUrl('https://x.com/a.mp4')).toBe(true);
    expect(isVideoUrl('https://x.com/a.MOV?token=1')).toBe(true);
    expect(isVideoUrl('https://x.com/a.jpg')).toBe(false);
    expect(isVideoUrl('')).toBe(false);
    expect(isVideoUrl(null)).toBe(false);
  });
});

describe('utils — crmNormName / crmMonthsSince', () => {
  it('crmNormName normaliza espaços e case', () => {
    expect(crmNormName('  JOÃO   SILVA ')).toBe('joão silva');
  });
  it('crmMonthsSince conta meses inteiros (clamp em 0)', () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000); // amanhã
    expect(crmMonthsSince(d)).toBe(0);
  });
  it('crmMonthsSince devolve null pra inválido', () => {
    expect(crmMonthsSince(null)).toBeNull();
    expect(crmMonthsSince('lixo')).toBeNull();
  });
});

describe('utils — hashStr / normTxt / starStr / agYmd', () => {
  it('hashStr é determinístico', () => {
    expect(hashStr('foo')).toBe(hashStr('foo'));
    expect(hashStr('foo')).not.toBe(hashStr('bar'));
  });
  it('normTxt remove acentos, baixa caixa e dá padding com espaços', () => {
    expect(normTxt('JOÃO')).toBe(' joao ');
    expect(normTxt('  ').startsWith(' ')).toBe(true);
  });
  it('starStr renderiza estrelas cheias + vazias', () => {
    expect(starStr(3)).toBe('★★★☆☆');
    expect(starStr(0)).toBe('☆☆☆☆☆');
    expect(starStr(5)).toBe('★★★★★');
  });
  it('agYmd devolve YYYY-MM-DD do fuso local', () => {
    expect(agYmd(new Date('2026-05-31T12:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('utils — throttle', () => {
  it('chama no primeiro call imediatamente', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('rate-limita calls subsequentes', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t();
    t();
    t();
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(150);
    // Trailing call dispara após a janela.
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
