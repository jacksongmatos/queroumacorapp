// env.ts — leitura de variáveis de ambiente no edge do Cloudflare Pages.
//
// O ponto central: os secrets definidos no painel do Pages NÃO chegam em
// `process.env` no edge. Eles vivem só no request context, que o runtime
// publica num symbol global. Confirmado depurando o portal admin em
// produção.
//
// Lemos esse symbol DIRETO, sem importar `@cloudflare/next-on-pages`: o
// entrypoint daquele pacote faz `require('server-only')`, que não está
// instalado, e isso derrubava a carga de ~40 arquivos de teste com
// "Cannot find module 'server-only'" (197 testes) — a suíte inteira que
// toca `security.ts` parava de rodar.
//
// Fora de um request handler (build, dev local, vitest) o symbol não
// existe e caímos em `process.env`, que é onde as variáveis estão nesses
// contextos.
//
// Use estas funções — nunca `process.env` direto — pra qualquer secret ou
// configuração lida em runtime.

/** Symbol onde o runtime do Cloudflare publica o contexto da request. */
const CF_REQUEST_CONTEXT = Symbol.for('__cloudflare-request-context__');

interface CloudflareRequestContext {
  env?: Record<string, unknown>;
  /** ExecutionContext do worker — é dele que sai o `waitUntil`. */
  ctx?: { waitUntil?: (p: Promise<unknown>) => void };
}

/** Lê o contexto da request publicado pelo runtime, se houver. */
function readRequestContext(): CloudflareRequestContext | undefined {
  try {
    return (globalThis as Record<symbol, unknown>)[CF_REQUEST_CONTEXT] as
      | CloudflareRequestContext
      | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Deixa um trabalho rodando DEPOIS da resposta já ter sido enviada.
 *
 * No edge do Cloudflare o worker é encerrado assim que a resposta sai —
 * promessa solta é abortada no meio. `waitUntil` é o que mantém o worker
 * vivo até ela terminar. Fora do edge (build, dev, vitest) não existe
 * contexto: aí AGUARDA a promessa, que é o comportamento correto nesses
 * ambientes e mantém os testes determinísticos.
 *
 * Nunca lança: falha no trabalho de fundo não pode virar erro de resposta.
 */
export function runAfterResponse(work: Promise<unknown>): void {
  const seguro = Promise.resolve(work).catch((e) => {
    console.error(
      'runAfterResponse: trabalho de fundo falhou:',
      e instanceof Error ? e.message : e,
    );
  });
  const waitUntil = readRequestContext()?.ctx?.waitUntil;
  if (typeof waitUntil === 'function') {
    waitUntil(seguro);
    return;
  }
  void seguro;
}

/**
 * Lê uma variável de ambiente. Prioridade: contexto da request do
 * Cloudflare (única fonte no edge) → `process.env` (build/dev/testes).
 */
export function getRuntimeEnv(key: string): string | undefined {
  const value = readRequestContext()?.env?.[key];
  if (value !== undefined && value !== null) return String(value);
  return process.env[key];
}

/**
 * Chave service role do Supabase (secret sensível). Só em código
 * server-side, e sempre depois de checar autorização.
 */
export function getSupabaseServiceKey(): string | undefined {
  return getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY');
}

/** Chave da OpenAI. */
export function getOpenAiKey(): string | undefined {
  return getRuntimeEnv('OPENAI_API_KEY');
}

/** Chave do Google Gemini. */
export function getGeminiKey(): string | undefined {
  return getRuntimeEnv('GEMINI_API_KEY');
}

/** Access token do Mercado Pago. */
export function getMercadoPagoToken(): string | undefined {
  return getRuntimeEnv('MP_ACCESS_TOKEN');
}

/** Secret usado pra validar o webhook do Mercado Pago. */
export function getMercadoPagoWebhookSecret(): string | undefined {
  return getRuntimeEnv('MP_WEBHOOK_SECRET');
}

// NÃO recriar aqui `getSupabaseUrl`/`getSupabaseAnonKey`. Eles existiam neste
// arquivo lendo SÓ as `NEXT_PUBLIC_*`, enquanto o `security.ts` tinha outra
// ordem — dois resolvedores discordando entre si, que é exatamente a classe de
// bug do incidente de 2026-09-04 (URL de um projeto + anon key de outro → o
// GoTrue respondia "Invalid API key" pra QUALQUER token). A URL e a anon key
// saem juntas de `resolveSupabaseEnv()` em `lib/api/security.ts`, sempre do
// MESMO par. Aqui fica só a leitura crua de env (`getRuntimeEnv`).
