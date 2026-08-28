// @vitest-environment jsdom
// sessionStorageHybrid — sessão do Supabase em localStorage + cookies
// fatiados. Os testes cobrem o contrato que protege o login no wrapper:
// (1) round-trip de valores maiores que 1 cookie; (2) limpeza total das
// fatias; (3) restauração pelo cookie quando o localStorage foi apagado
// (o cenário do wrapper); (4) hasStoredSession enxergando qualquer um
// dos dois armazéns.
import { afterEach, describe, expect, it } from 'vitest';
import {
  splitIntoCookieChunks,
  writeSessionCookie,
  readSessionCookie,
  clearSessionCookie,
  hybridAuthStorage,
  hasStoredSession,
} from '../lib/sessionStorageHybrid';

const KEY = 'sb-uwqebaqweehiljsqkifm-auth-token';

function wipeAllCookies() {
  for (const part of document.cookie.split('; ')) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

afterEach(() => {
  window.localStorage.clear();
  wipeAllCookies();
});

describe('splitIntoCookieChunks', () => {
  it('devolve 1 fatia pra valor pequeno e N pra valor grande', () => {
    expect(splitIntoCookieChunks('abc')).toEqual(['abc']);
    const big = 'x'.repeat(7500);
    const chunks = splitIntoCookieChunks(big);
    expect(chunks.length).toBe(3); // 3000 + 3000 + 1500
    expect(chunks.join('')).toBe(big);
  });

  it('valor vazio vira zero fatias', () => {
    expect(splitIntoCookieChunks('')).toEqual([]);
  });
});

describe('cookie round-trip', () => {
  it('grava e lê de volta um payload de sessão >4KB (multi-fatia)', () => {
    // JSON parecido com a sessão real: caracteres que exigem encoding.
    const value = JSON.stringify({
      access_token: 'ey.' + 'A'.repeat(3000),
      refresh_token: 'r'.repeat(2000),
      user: { email: 'pintor@exemplo.com.br', name: 'João "Tinta" Ção' },
    });
    expect(value.length).toBeGreaterThan(4096);
    writeSessionCookie(KEY, value);
    expect(readSessionCookie(KEY)).toBe(value);
  });

  it('sessão nova MENOR apaga fatias sobrando da anterior', () => {
    writeSessionCookie(KEY, 'y'.repeat(7000)); // 3 fatias
    writeSessionCookie(KEY, 'z'.repeat(100)); // 1 fatia
    expect(readSessionCookie(KEY)).toBe('z'.repeat(100));
    expect(document.cookie).not.toContain(`${KEY}.1=`);
    expect(document.cookie).not.toContain(`${KEY}.2=`);
  });

  it('clearSessionCookie remove todas as fatias', () => {
    writeSessionCookie(KEY, 'w'.repeat(7000));
    clearSessionCookie(KEY);
    expect(readSessionCookie(KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${KEY}.0=`);
  });

  it('ler chave inexistente devolve null', () => {
    expect(readSessionCookie('sb-outra-auth-token')).toBeNull();
  });
});

describe('hybridAuthStorage', () => {
  it('setItem grava nos DOIS armazéns', () => {
    hybridAuthStorage.setItem(KEY, '{"a":1}');
    expect(window.localStorage.getItem(KEY)).toBe('{"a":1}');
    expect(readSessionCookie(KEY)).toBe('{"a":1}');
  });

  it('getItem restaura do cookie quando o localStorage foi apagado (wrapper)', () => {
    hybridAuthStorage.setItem(KEY, '{"token":"sobreviveu"}');
    window.localStorage.clear(); // o wrapper limpou
    expect(hybridAuthStorage.getItem(KEY)).toBe('{"token":"sobreviveu"}');
    // e re-hidrata o localStorage pro fluxo normal voltar
    expect(window.localStorage.getItem(KEY)).toBe('{"token":"sobreviveu"}');
  });

  it('localStorage fresco tem prioridade sobre o cookie', () => {
    writeSessionCookie(KEY, '"velho"');
    window.localStorage.setItem(KEY, '"novo"');
    expect(hybridAuthStorage.getItem(KEY)).toBe('"novo"');
  });

  it('removeItem limpa os dois', () => {
    hybridAuthStorage.setItem(KEY, '"x"');
    hybridAuthStorage.removeItem(KEY);
    expect(hybridAuthStorage.getItem(KEY)).toBeNull();
    expect(readSessionCookie(KEY)).toBeNull();
  });
});

describe('hasStoredSession', () => {
  it('false com tudo limpo', () => {
    expect(hasStoredSession()).toBe(false);
  });

  it('true com sessão só no localStorage', () => {
    window.localStorage.setItem(KEY, '{"t":1}');
    expect(hasStoredSession()).toBe(true);
  });

  it('true com sessão só no cookie', () => {
    writeSessionCookie(KEY, '{"t":1}');
    window.localStorage.clear();
    expect(hasStoredSession()).toBe(true);
  });

  it('ignora chaves que não são de auth do Supabase', () => {
    window.localStorage.setItem('theme', 'dark');
    window.localStorage.setItem('sb-algo-outra-coisa', 'x');
    expect(hasStoredSession()).toBe(false);
  });
});
