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
}

/**
 * Lê uma variável de ambiente. Prioridade: contexto da request do
 * Cloudflare (única fonte no edge) → `process.env` (build/dev/testes).
 */
export function getRuntimeEnv(key: string): string | undefined {
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[CF_REQUEST_CONTEXT] as
      | CloudflareRequestContext
      | undefined;
    const value = ctx?.env?.[key];
    if (value !== undefined && value !== null) return String(value);
  } catch {
    // Qualquer coisa estranha no globalThis não pode derrubar a leitura —
    // o fallback abaixo resolve.
  }
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

/** Chave anônima do Supabase (pública, pode aparecer no client). */
export function getSupabaseAnonKey(): string | undefined {
  return getRuntimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/** URL do projeto Supabase. */
export function getSupabaseUrl(): string | undefined {
  return getRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL');
}
