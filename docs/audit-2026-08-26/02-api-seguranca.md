# Auditoria — API e Segurança

## Visão geral

**39 rotas** (todas `runtime = 'edge'`), padrão controller-fino → service (`lib/api/_services/**`), núcleo de segurança em `lib/api/security.ts` (auth via `/auth/v1/user`, gates PRO, cota mensal de IA, rate limit via RPC `check_rate_limit` no Supabase — estado durável compartilhado entre isolates, porém fail-open em erro). Distribuição: 18 rotas de IA via `gateProAI`/`gateProAIForm`, 5 admin (token + ADMIN_EMAILS), 2 webhooks HMAC (MP e Meta), 2 IAP stubs com kill-switch, 5 públicas intencionais (health, cidades, reverse-geocode, log-error, auth-rate-check), resto com `requireAuthStrict`. Só 6 rotas têm schema Zod. Dois achados dominam o risco: (1) `gateProAI` é fail-open para anônimo — requisição sem token passa por auth, PRO e rate-limit e chega na IA; (2) a regra "nunca process.env direto, sempre getRuntimeEnv" violada em ~25 pontos, incluindo secrets do Mercado Pago; os helpers tipados de env.ts são código morto (zero usos).

## Inventário de rotas (resumo)

- Admin (verifyAdminToken + ensureAdminEmail): admin/errors-list (60/min), admin/moderate (60/min, request.json() sem cap), admin/users (30/min, injeção leve no filtro or=), upload-style-ref (20/min), whatsapp/send (Zod, 30/min).
- IA via gateProAI/gateProAIForm (TODAS fail-open p/ anônimo): agenda-order, alice (+3/dia fail-open), alice/tts, area-from-photo, caption, chat-ai (Zod), crm-draft, fe, fin-analysis, generate-logo, ig-art (timeout 28s), ig-art-diag, pricing-suggest, receipt-ocr, resolve-color, senna, transcribe, tts.
- Auth estrita: apple-iap-verify e play-billing-verify (STUBs gated por env flag, 10/min IP), delete-account (5/min, audit critical), me-export (3/min, audit critical), moderate (null-check explícito — a exceção correta), moderate-video (verifyOwnerToken + allowlist supabase.co).
- Sem auth intencional: health (expõe build marker/região), cidades (whitelist 27 UFs, proxy IBGE), reverse-geocode (bounds, proxy BigDataCloud), log-error (Zod + sanitizer, user_id não verificado), auth-rate-check.
- Webhooks: mp-webhook (HMAC fail-closed em prod, anti-retry-storm, LÊ SECRET VIA process.env), whatsapp/webhook (HMAC Meta fail-closed, dedupe wamid).
- Outros: auth/set-session-cookie (JWT validado, cookie httpOnly/Secure/Lax 1h), checkout (Zod, origem hardcoded), push-notify (x-internal-secret constant-time, Zod UUIDs, fail-closed).

## Pontos fortes

- **Rate limit durável**: RPC no Postgres via service_role, chave user-first com fallback de IP (CF-Connecting-IP priorizado).
- **Webhooks bem construídos**: HMAC sobre raw body antes do parse, comparação constant-time, fail-closed em prod sem secret, sempre-200 pós-assinatura, idempotência real (wamid UNIQUE, upsert_invoice por external_id).
- **Anti-fraude no MP**: valor/currency validados, preapproval re-consultado na API do MP, external_reference derivado do token, origem hardcoded.
- **SSRF sob controle**: todo fetch externo allowlisted; sem SQL cru; PostgREST com encodeURIComponent na quase totalidade.
- **Sem leak em erro (R-H11)**: errorResponse genérico + Sentry; formatZodError esconde paths em prod.
- **Auditoria com modo `critical`** fail-closed (me-export, delete-account, set_pro, mp paid).
- **Caps de payload** (readBody com 413, caps por rota).
- **push-notify**: compare constant-time, Zod restringindo url a path relativo e UUIDs.

## Achados

[CRITICO] `gateProAI`/`gateProAIForm` não barram requisição anônima — 18 rotas de IA abertas sem auth e sem rate limit — lib/api/security.ts:402-422 (e 617-638) — `requireAuth` é fail-open e nunca popula `auth.error` (retorna `warn`), então o `if (auth.error)` na linha 413 é código morto; com token ausente, `userId` fica undefined, `requirePro(undefined)` retorna `{pro:true}` (linha 343 — comentário "gateProAI já barra" é falso), `checkRateLimit({userId:undefined})` retorna `skipped` (231) e `gateAiUsage` sem userId retorna `allowed` (461-464). `POST /api/chat-ai` sem token chama OpenAI/Gemini sem gate, sem limite, sem cota — abuso de custo direto em 18 rotas (moderate é a exceção correta). — Recomendação: retornar 401 quando `!auth.user` nos 2 gates (ou requireAuthStrict); defesa em profundidade: enforceRateLimit por IP sem userId.

[ALTO] Secrets do Mercado Pago via `process.env` direto no caminho de pagamento — mp-webhook.ts:57,134,213,404,596-656; checkout.ts:39,73 — Se MP_WEBHOOK_SECRET/MP_ACCESS_TOKEN forem secrets de runtime (não inlined), verifyMpSignature rejeita 401 todos os webhooks (assinatura PRO nunca confirma) e checkout responde 503. `getMercadoPagoToken()`/`getMercadoPagoWebhookSecret()` em env.ts:65-72 têm zero chamadores. — Recomendação: trocar por getRuntimeEnv/helpers; validar webhook aceitando eventos em produção.

[ALTO] Regressão sistêmica da regra getRuntimeEnv: ~25 leituras de process.env pra chaves de IA — chat-ai/route.ts:953, alice/route.ts:331, ig-art.ts:161,543, tts.ts, moderate.ts, generate-logo.ts etc. — Funciona hoje só porque as chaves estão como plain-text no build. Mover pra Secret no painel quebra a rota silenciosamente (503 permanente). getOpenAiKey()/getGeminiKey() código morto. — Recomendação: varredura única; lint proibindo process.env.<SECRET> fora de env.ts.

[ALTO] IAP stubs continuam sem verificação real mesmo com a flag ligada — apple-iap-verify/route.ts:604-669, play-billing-verify/route.ts:490-548 — Com flag true, receipt forjado grava invoice paid e trigger ativa PRO. — Recomendação: manter flag off; implementar chamada real antes do upsert_invoice.

[MEDIO] `assertProductionEnvs` lê process.env no module-load de security.ts — env-check.ts:38 via security.ts:30 — padrão banido; se SUPABASE_SERVICE_ROLE_KEY virar secret de runtime, throw no module-load derruba todas as rotas com 500. — Recomendação: lazy no primeiro request via getRuntimeEnv.

[MEDIO] `isPortalAdmin` do guard RSC seleciona coluna `is_admin` inexistente — lib/auth-server.ts:143 — select=portal_access,is_admin,role retorna 400, função retorna sempre false. Fail-closed, mas admins por portal_access/role fora de ADMIN_EMAILS caem em 404 no /admin/*. — Recomendação: remover is_admin do select; teste de contrato.

[MEDIO] Rate limit fail-open em todas as camadas — security.ts:231-233,257,265-267 — sem service key, erro de RPC, timeout ou userId vazio ⇒ allowed. IP ausente cai pra string 'unknown' (bucket global). Sem evidência de regra de RL no Cloudflare. — Recomendação: fail-closed (ou limite conservador) nas rotas de custo; confirmar WAF do CF PRO.

[MEDIO] CSP/CORS do /api/* declarados num _headers que não acompanha o deploy — ver achado da camada plataforma. OPTIONS 204 sem headers CORS sugerem intenção que ninguém aplica. — Recomendação: next-app/public/_headers + verificação em produção.

[MEDIO] 24 rotas sem schema Zod, campos crus pra prompts de IA — fin-analysis/route.ts:26-33, crm-draft, alice, agenda-order, senna, fe — payloads grandes inflam custo e superfície de prompt-injection. — Recomendação: estender lib/api/schemas/* às rotas restantes, começando pelas de IA.

[BAIXO] Injeção de filtro PostgREST em listUsers — admin-users.ts:161 (e admin-errors-list.ts:59) — interpola busca sem escapar `,()`. Admin-only, select fixo. — Recomendação: sanitizar q.

[BAIXO] verifyAdminToken vaza corpo da resposta do Supabase Auth no erro — _admin-helpers.ts:44 — res.text() slice 120 vai no JSON ao cliente. — Recomendação: mensagem fixa; detalhe só em Sentry.

[BAIXO] HMAC do MP sem checagem de frescor do ts — mp-webhook.ts:648-652 — replay de `authorized` re-estende pro_expires_at (+33d). — Recomendação: rejeitar ts com desvio > ~5min.

[BAIXO] Inconsistências menores — (a) admin/moderate usa request.json() cru; (b) delete-account sem AbortSignal; (c) log-error aceita user_id arbitrário; (d) OPTIONS só em 4 rotas; (e) lib/schemas.ts:296 tem MIN_AGE=18 enquanto CLAUDE.md/RELEASE_AUDIT documentam 16 — divergência doc↔código a confirmar. — Recomendação: normalizar pelos helpers existentes.
