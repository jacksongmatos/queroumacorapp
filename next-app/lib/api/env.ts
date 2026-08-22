import { getRequestContext } from '@cloudflare/next-on-pages';

/**
 * Runtime environment variable accessor for Cloudflare Pages.
  * 
   * In Cloudflare Pages edge runtime, environment variables must be accessed via
    * getRequestContext().env, not process.env. This helper provides a fallback to
     * process.env for local development and build time.
      * 
       * Always use this function (or specialized helpers below) instead of reading
        * process.env directly for secrets and runtime configuration.
         */
         export function getRuntimeEnv(key: string): string | undefined {
           try {
               const { env } = getRequestContext();
                   const value = env?.[key as keyof typeof env];
                       if (value !== undefined) return String(value);
                         } catch {
                             // getRequestContext() throws outside request handlers — fallback to process.env
                               }
                                 return process.env[key];
                                 }

                                 /**
                                  * Get Supabase service role key (sensitive secret).
                                   * Only use in server-side code with proper authorization checks.
                                    */
                                    export function getSupabaseServiceKey(): string | undefined {
                                      return getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY');
                                      }

                                      /**
                                       * Get OpenAI API key.
                                        */
                                        export function getOpenAiKey(): string | undefined {
                                          return getRuntimeEnv('OPENAI_API_KEY');
                                          }

                                          /**
                                           * Get Google Gemini API key.
                                            */
                                            export function getGeminiKey(): string | undefined {
                                              return getRuntimeEnv('GEMINI_API_KEY');
                                              }

                                              /**
                                               * Get MercadoPago access token.
                                                */
                                                export function getMercadoPagoToken(): string | undefined {
                                                  return getRuntimeEnv('MP_ACCESS_TOKEN');
                                                  }

                                                  /**
                                                   * Get MercadoPago webhook secret.
                                                    */
                                                    export function getMercadoPagoWebhookSecret(): string | undefined {
                                                      return getRuntimeEnv('MP_WEBHOOK_SECRET');
                                                      }

                                                      /**
                                                       * Get Supabase anonymous key (public key, safe to expose).
                                                        */
                                                        export function getSupabaseAnonKey(): string | undefined {
                                                          return getRuntimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
                                                          }

                                                          /**
                                                           * Get Supabase URL.
                                                            */
                                                            export function getSupabaseUrl(): string | undefined {
                                                              return getRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL');
                                                              }
