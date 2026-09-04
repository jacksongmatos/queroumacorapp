// Regra de arquitetura nascida do incidente de 2026-09-04: a URL do Supabase e
// a anon key TÊM que sair do MESMO par de envs.
//
// O que aconteceu: `getSupabaseUrl()` e `getSupabaseAnonKey()` resolviam de
// forma INDEPENDENTE, cada uma com a sua própria ordem de fallback. Em produção
// o painel do Cloudflare tinha `NEXT_PUBLIC_SUPABASE_URL` +
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` (par correto) e, herdado do app vanilla, um
// `SUPABASE_ANON_KEY` de OUTRO projeto — sem `SUPABASE_URL` nenhum. Resultado:
// URL de um projeto, chave de outro. O GoTrue respondia "Invalid API key" pra
// QUALQUER token, e o `requireAuth` colapsava isso em "Faça login" — em TODAS
// as rotas de IA, para usuários perfeitamente logados.
//
// Cinco arquivos tinham a própria ordem de fallback, e um sexto resolvedor
// paralelo vivia em `lib/api/env.ts`. Este teste existe pra nenhum sétimo
// aparecer em silêncio: regra que ninguém verifica é sugestão.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** `security.ts` É a implementação do par único — é o único isento. */
const ISENTO = 'lib/api/security.ts';

/**
 * Leitura crua de uma env do Supabase (URL ou anon key) por qualquer via —
 * `getRuntimeEnv('...')` ou `process.env....`. Só o resolvedor único pode.
 */
const LEITURA_CRUA =
  /(?:getRuntimeEnv\(\s*['"`](NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY)['"`]|process\.env\.(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY)\b)/g;

/**
 * Corpo de uma função top-level exportada, da assinatura até o `}` na coluna
 * 0. Basta pra ler o que a função chama — é análise de fonte, não de AST, e
 * é o mesmo grau de rigor do teste de `getRuntimeEnv` que já existe.
 */
function corpoDaFuncao(fonte: string, nome: string): string | null {
  const abre = new RegExp(`export (?:async )?function ${nome}\\b`).exec(fonte);
  if (!abre) return null;
  const resto = fonte.slice(abre.index);
  const fecha = resto.indexOf('\n}\n');
  return fecha === -1 ? resto : resto.slice(0, fecha);
}

function varrer(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho, achados);
    else if (caminho.endsWith('.ts') || caminho.endsWith('.tsx')) achados.push(caminho);
  }
  return achados;
}

describe('regra: URL e anon key do Supabase saem do mesmo par', () => {
  it('só security.ts lê as envs do Supabase cruas em lib/api e app/api', () => {
    const arquivos = [...varrer('lib/api'), ...varrer('app/api')].filter(
      (a) => a !== ISENTO,
    );
    const violacoes: string[] = [];

    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const m of fonte.matchAll(LEITURA_CRUA)) {
        const linha = fonte.slice(0, m.index).split('\n').length;
        violacoes.push(`${arquivo}:${linha} → ${m[0]}`);
      }
    }

    expect(
      violacoes,
      `Leitura crua de env do Supabase fora do resolvedor único.\n` +
        `Use getSupabaseUrl()/getSupabaseAnonKey()/resolveSupabaseEnv() de ` +
        `lib/api/security.ts — eles devolvem URL e chave SEMPRE do mesmo par.\n` +
        violacoes.join('\n'),
    ).toEqual([]);
  });

  it('o caminho de autenticação resolve o par de UMA vez', () => {
    // A guarda de `ref` cobre a divergência residual, mas duas resoluções
    // independentes dentro do gate de auth são a FORMA exata do bug — e este
    // é o caminho onde ela custou mais caro. `requireAuth` e
    // `requireAuthStrict` pegam url e anonKey do MESMO objeto.
    const fonte = readFileSync(ISENTO, 'utf8');

    for (const nome of ['requireAuth', 'requireAuthStrict']) {
      const corpo = corpoDaFuncao(fonte, nome) ?? '';
      expect(corpo, `função ${nome} não encontrada em ${ISENTO}`).not.toBe('');
      expect(
        corpo,
        `${nome} tem que resolver o par com resolveSupabaseEnv()`,
      ).toContain('resolveSupabaseEnv(');
      expect(
        corpo.includes('getSupabaseUrl(') || corpo.includes('getSupabaseAnonKey('),
        `${nome} voltou a resolver url e anon key SEPARADAMENTE — use ` +
          `resolveSupabaseEnv(), que devolve as duas do mesmo par`,
      ).toBe(false);
    }
  });

  it('ninguém mais pede a anon key solta — ela só sai do par', () => {
    // Uma chave anon sem a URL do mesmo prefixo é exatamente o que produziu o
    // cruzamento. Quem precisa dela precisa da URL junto: resolveSupabaseEnv().
    // O getter segue exportado (compat e testes), mas sem call site vivo.
    const arquivos = [...varrer('lib/api'), ...varrer('app/api')].filter(
      (a) => a !== ISENTO,
    );
    const violacoes = arquivos.filter((a) =>
      /getSupabaseAnonKey\s*\(/.test(readFileSync(a, 'utf8')),
    );
    expect(
      violacoes,
      'Use resolveSupabaseEnv() — url e anon key do MESMO par:\n' +
        violacoes.join('\n'),
    ).toEqual([]);
  });

  it('lib/api/env.ts não voltou a expor um resolvedor paralelo', () => {
    const fonte = readFileSync('lib/api/env.ts', 'utf8');
    expect(fonte).not.toMatch(/export function getSupabaseUrl\b/);
    expect(fonte).not.toMatch(/export function getSupabaseAnonKey\b/);
  });
});
