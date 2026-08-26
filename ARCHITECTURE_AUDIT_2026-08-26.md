# Auditoria de Arquitetura — QueroUmaCor

**Data:** 2026-08-26 · **Escopo:** 100% do repositório (`queroumacor-max/queroumacorapp`) · **Método:** 6 auditorias paralelas por camada (frontend, API/segurança, dados, legado/portal, plataforma/deploy, testes/CI), com leitura direta do código e execução real de `vitest`, `tsc`, `next lint`, `npm audit` e `npm outdated`. Toda afirmação abaixo foi verificada em arquivo/linha ou medida por comando; nada é herdado de auditorias anteriores sem reconferência.

**Números do repo:** ~76.000 linhas de fonte no `next-app` (+ ~20.500 de testes), 71 páginas, 39 rotas de API (todas edge), 50 services + 50 hooks, 53 migrations SQL, portal estático de 3.446 linhas (fonte) compilado à mão, wrappers Capacitor iOS + TWA Android.

---

## 1. Sumário executivo

O QueroUmaCor tem **código significativamente acima da média** para um produto dessa idade: padrão RSC-shell consistente nas 71 páginas, TanStack Query usado canonicamente, service worker exemplar, webhooks com HMAC constant-time e idempotência real, trilha de auditoria fail-closed, migrations SQL com documentação embutida excepcional, 1.163 testes rodando em ~15s e TypeScript strict com zero erros. As auditorias anteriores (LAUNCH_AUDIT, RELEASE_AUDIT, CRIT-1..5) deixaram controles reais com regressão automatizada.

O risco de verdade **não está no código — está na cola entre o repositório e a produção**. Os 6 achados críticos desta auditoria são todos dessa natureza: um gate de segurança que deixa anônimo passar, um arquivo de headers que nunca chega ao deploy, uma policy antiga que anula um fix de LGPD, identidades de pacote Android contraditórias, um CI que está vermelho há tanto tempo que ninguém o lê, e uma dependência com CVE crítico. Todos são corrigíveis em dias, não meses.

### Notas por camada

| Camada | Nota | Resumo |
|---|---|---|
| Frontend (Next.js) | **B+** | Nenhum crítico. Dívidas: 4 personas de IA clonadas (~4.300 linhas), 5 god components >1.000 linhas, AppShell remontado a cada navegação, catálogo de ~4k produtos baixado inteiro no client. |
| API & Segurança | **C+** | Fundamentos fortes (HMAC, audit, rate limit durável, SSRF allowlisted), mas as 18 rotas de IA são fail-open para anônimo e a regra `getRuntimeEnv` está violada em ~25 pontos, inclusive nos secrets do Mercado Pago. |
| Dados (Supabase) | **C+** | SQL individual de alta qualidade; operação frágil: sem controle de migração aplicada, drift comprovado repo↔banco, policy de `quotes` furada (LGPD), `is_portal_admin()` possivelmente quebrada em runtime. |
| Legado & Portal | **C** | Cutover concluído, mas ~2,5 MB de arquivos mortos, 11+ docs descrevendo a arquitetura deletada, e o portal com escalada de `role='admin'` validada só no client. |
| Plataforma & Mobile | **C** | Web/PWA sólido; mobile não está pronto para as lojas: 3 package IDs Android conflitantes, OAuth quebrado em WebView, zero push nativo, zero fallback offline no wrapper. |
| Testes & CI | **C+** | Suíte forte e rápida, mas o CI está permanentemente vermelho, nada roda em push para `main`, e o deploy de produção não espera CI. |

**Nota geral: C+** — produto lançável no web, com 6 correções críticas pendentes antes de qualquer expansão (campanha de aquisição, lojas de app, retomada de billing).

---

## 2. Achados CRÍTICOS (6)

### C1. 18 rotas de IA aceitam requisição anônima — sem auth, sem PRO, sem rate limit, sem cota
`next-app/lib/api/security.ts:402-422` (e 617-638 para multipart)
`requireAuth` é fail-open e **nunca popula `auth.error`**, então o `if (auth.error)` dentro de `gateProAI` é código morto. Com token ausente/inválido: `userId` fica `undefined` → `requirePro(undefined)` retorna `{ pro: true }` (linha 343; o comentário "gateProAI já barra" é falso) → `checkRateLimit` retorna `skipped` (linha 231) → `gateAiUsage` retorna `allowed` (461-464). Resultado: `POST /api/chat-ai {"message":"..."}` **sem nenhum token** chama a OpenAI/Gemini. Vale para chat-ai, alice, fe, senna, tts, alice/tts, generate-logo, ig-art, caption, transcribe, area-from-photo, pricing-suggest, fin-analysis, crm-draft, agenda-order, resolve-color, receipt-ocr, ig-art-diag. Abuso de custo direto e sem atribuição (`/api/moderate` é a exceção que faz o null-check correto).
**Ação:** retornar 401 quando `!auth.user` dentro de `gateProAI`/`gateProAIForm` (ou trocar por `requireAuthStrict`); como defesa em profundidade, `enforceRateLimit` por IP quando não houver userId.

### C2. A CSP inteira (e CORS/no-store de `/api/*`) não é deployada — o `_headers` está fora do output do build
`_headers` (raiz) vs `next-app/wrangler.toml:4` (`pages_build_output_dir = .vercel/output/static`)
O Cloudflare Pages só lê `_headers`/`_redirects` do diretório de output, que inclui apenas `next-app/public/` + build. O `_headers` da raiz — com **Content-Security-Policy, Permissions-Policy, COOP/CORP, CORS restrito e `Cache-Control: no-store` para `/api/*`** — não está em `next-app/public/` e nenhum passo de build o copia. Só sobrevivem os 4 headers de `next-app/next.config.mjs:42-60` (nosniff, Referrer-Policy, HSTS, X-Frame-Options). Grave num app com histórico de XSS (CRIT-3) e que depende de `Permissions-Policy: payment=(self)` para Digital Goods na TWA. `DEPLOYMENT.md` documenta a CSP como ativa — está errado. O mesmo mecanismo derruba o `robots.txt` (404 em produção, ver M-P1).
**Ação:** mover o conteúdo do `_headers` para `next-app/public/_headers` (ou portar para `headers()` do next.config); depois validar com `curl -I https://queroumacor.com.br` (o container desta sessão não alcança o domínio — validação é sua).

### C3. Policy `View quotes active` (Wave 8) nunca foi dropada e anula o fix LGPD da Wave 27
`migrations/2026-05-31-soft-delete.sql:106-114` vs `migrations/2026-06-10-wave-27-rls-hardening.sql:64-75`
A Wave 8 criou `View quotes active` com `USING (deleted_at IS NULL OR client_id = auth.uid() OR ...)` — o primeiro termo sozinho concede SELECT de **qualquer quote ativa a qualquer usuário autenticado**. A Wave 27 (B4) restringiu quotes a participantes justamente porque vazavam telefone/endereço de leads (LGPD), mas dropou apenas outras 2 policies. Policies permissivas são combinadas por OR: se ambas estão no banco, a restrição B4 é letra morta.
**Ação (SQL para rodar no Supabase SQL Editor):**
```sql
-- Confirmar o furo:
SELECT policyname, qual FROM pg_policies WHERE tablename = 'quotes';
-- Se "View quotes active" aparecer:
DROP POLICY IF EXISTS "View quotes active" ON public.quotes;
```

### C4. Identidade Android fraturada: 3 package IDs + fingerprint placeholder
`twa-manifest.json:2,52` vs `next-app/public/.well-known/assetlinks.json:6` vs `capacitor.config.ts`/`ios/App/App/Info.plist`
O `twa-manifest.json` declara `com.calicolors.queroumacor` com fingerprint `REPLACE_WITH_REAL_SHA256…`; o `assetlinks.json` deployado declara `br.com.queroumacor`; o Capacitor usa `br.com.queroumacor.app`; o verify de Play Billing espera `br.com.queroumacor.app`; e o `PRO_PRODUCT_ID` é `com.calicolors.queroumacor.pro.monthly`. Uma TWA construída hoje **falha a verificação Digital Asset Links** (abre com barra de navegador — rejeição na prática no Play) e o produto de billing fica órfão de pacote.
**Ação:** eleger UM applicationId e alinhar twa-manifest, assetlinks (incluindo o certificado do Play App Signing, além do upload key), o packageName do verify e o namespace do product ID.

### C5. Gate de merge inexistente: CI permanentemente vermelho e `main` sem nenhum check
`.github/workflows/ci.yml:7-9` — medido em 2026-08-26: `next lint` sai com exit 1 (13 erros) e `vitest` com exit 1 (11 falhas), então **todo push de branch fica vermelho desde sempre** — vermelho crônico não distingue regressão nova de baseline. Pior: `branches-ignore: [main]` significa que merge/push em `main` não roda lint, typecheck nem teste algum, e o deploy de produção (build automático do CF Pages) não espera CI. O fluxo "merge para main automaticamente" despacha para produção sem gate efetivo. Entre as 11 falhas, 2 são **drift real de regra de negócio** no `mktClassify` (ver A-T1).
**Ação:** (1) zerar as 11 falhas (~1-2h: fake supabase sem `.or()`/`.gte()`, asserções desatualizadas de signup/chat, decisão de produto no mktClassify); (2) corrigir os 13 erros de lint (triviais, `&quot;`); (3) rodar CI também em push para `main`; (4) branch protection exigindo o job `validate`.

### C6. jspdf 2.5.2 com vulnerabilidade CRITICAL
`next-app/package.json:20` — única CRITICAL do `npm audit --omit=dev` (ReDoS + DoS + Local File Inclusion/Path Traversal); o fix é o major 4.2.1. Junto dela, 8 HIGH — a maioria (next, sharp, nanoid, fast-uri, postcss, brace-expansion) com fix **dentro do semver atual** via `npm audit fix`/`npm update`.
**Ação:** upgrade jspdf → 4.x (API de `text`/`addImage` quase compatível; uso é o PDF de orçamento) + `npm audit fix` para as HIGH não-breaking; re-rodar a suíte.

---

## 3. Achados ALTOS (consolidados, 17)

**API & Segurança**
- **A-S1. Secrets do Mercado Pago lidos via `process.env` no caminho de pagamento** — `lib/api/_services/mp-webhook.ts:57,134,213,404,596-656`, `checkout.ts:39,73`. Viola a regra do próprio projeto (edge CF: env só via `getRuntimeEnv`). Se `MP_WEBHOOK_SECRET`/`MP_ACCESS_TOKEN` forem secrets de runtime (não inlined no build), o webhook rejeita 401 tudo e o checkout dá 503. Os helpers `getMercadoPagoToken()`/`getMercadoPagoWebhookSecret()` de `env.ts` têm **zero chamadores** (código morto).
- **A-S2. Regressão sistêmica da regra `getRuntimeEnv`: ~25 leituras de `process.env` para chaves de IA** — chat-ai, alice, ig-art, tts, moderate, generate-logo etc. (+ a flag IAP em `play-billing-verify:95`/`apple-iap-verify:95`). Funciona hoje só porque as chaves estão como plain-text de build; mover qualquer uma para "Secret" no painel quebra a rota silenciosamente. Adicionar lint proibindo `process.env.<SECRET>` fora de `env.ts`.
- **A-S3. IAP stubs seguem aceitando recibo forjado se a flag ligar** — com `IAP_PRODUCTION_VERIFICATION_ENABLED=true`, qualquer `receipt`/`purchaseToken` grava invoice `paid` e o trigger ativa PRO. Manter a flag desligada; implementar a chamada real (Apple verifyReceipt / Play Developer API) antes do `upsert_invoice`.

**Dados**
- **A-D1. `is_portal_admin()` provavelmente referencia `profiles.is_admin`, coluna que não existe** — `migrations/2026-06-05-is-portal-admin-permissive.sql:18-30`; a Wave 34 provou empiricamente o 42703. Há **três definições divergentes** da função mais crítica da RLS (~13 tabelas dependem). Correlato no app: `lib/auth-server.ts:143` seleciona `is_admin` via PostgREST → 400 → `isPortalAdmin` retorna sempre `false` (fail-closed, mas o fallback de admin por `portal_access`/`role` está quebrado). Verificar com `SELECT prosrc FROM pg_proc WHERE proname='is_portal_admin'` e recriar com o padrão `to_jsonb` da Wave 34.
- **A-D2. `get_feed_v2` definida 5× em 5 arquivos do mesmo dia; ordem alfabética regride a versão final** — rodar a pasta em ordem de nome termina sem boost/blocks/verified. Adotar prefixo sequencial e/ou migration consolidada canônica.
- **A-D3. Sem ambiente de migração gerenciado — drift real comprovado** — sem `schema_migrations`/CLI/CI/rollback; registro em prosa no CLAUDE.md. As próprias migrations documentam: policies `OR true` no banco sem correspondente no repo, funções no banco ausentes do repo, colunas no repo ausentes do banco, waves que só existiram "no chat". Adotar `supabase migration`/`db push` ou ao menos tabela `applied_migrations` + diff periódico de `pg_dump --schema-only`.
- **A-D4. `database.types.ts` mente nos dois sentidos — 77 casts manuais em 29 services** — ~9 tabelas usadas não existem no tipo (brand_logos, blocks, push_subscriptions, invoices, ai_usage…); o tipo declara `is_admin` que não existe no banco; só 9 de ~20 RPCs tipadas. Regenerar `supabase gen types` e tratar como artefato de CI.

**Frontend**
- **A-F1. ~4.300 linhas clonadas nas 4 personas de IA** — 4 hooks + 4 chats ~70% idênticos; o gatilho de refactor declarado no próprio código ("quando vier a 3ª persona") já passou. Extrair `useAiPersona(config)` + `<AiPersonaChat config>`.
- **A-F2. AppShell montado por página** — 41 páginas remontam TopNav/BottomNav/AppTour/RealtimeBindings a cada navegação, recriando a subscription realtime `global-<userId>`. Mover o chrome para `app/(private)/layout.tsx`.
- **A-F3. 5 god components >1.000 linhas** (QuoteWizard 1.188, WallARView 1.170, ProductDetailSheet 1.134, PostCard 1.040, ProductsList 1.024) — UI + regra + acesso a dados no mesmo arquivo, nenhum com teste.
- **A-F4. Catálogo inteiro (~4k produtos) baixado no client** — `lib/hooks/useProducts.ts:59-61` pagina em batches de 1.000 até trazer tudo; busca/filtro client-side. Mover para o servidor (FTS `search_all` já existe).

**Legado & Portal**
- **A-L1. Cadastro por convite do portal grava `role='admin'` + `portal_access=true` direto do client** — `next-app/public/portal/app.jsx:138, 3341-3346`, com validação do convite só no browser (e consultando `invites`, não a `invite_codes` da Wave 5). Ou o trigger `protect_profile_columns` bloqueia (fluxo silenciosamente quebrado) ou há caminho de escalada. Mover para rota server-side com service_role.
- **A-L2. Pipeline de build do portal é 100% manual e a receita não está versionada** — babel com opções exatas descritas só em prosa no CLAUDE.md + hash SRI via openssl + bump de `?v=`, três passos com falha silenciosa (portal preso em "Carregando…"). Commitar um `scripts/build-portal.mjs` que faz os três de uma vez.
- **A-L3. 11+ documentos da raiz descrevem a arquitetura deletada** — o README afirma "Frontend: Vanilla JS" e "Backend: Cloudflare Pages Functions"; API.md/AUTH.md/EVENTS.md/KV.md/LAYERS.md/ARCHITECTURE_PLAN.md apontam para arquivos que não existem. Mover para `docs/history/` e reescrever o README.

**Plataforma**
- **A-P1. Login Google/Apple quebrado no app empacotado** — `AuthProvider.tsx:198` navega a própria WebView pro provedor: Google recusa (`disallowed_useragent`) e o App-Bound Domains do iOS bloqueia. Zero uso de `@capacitor/browser`. Blocker de review.
- **A-P2. Zero fallback offline no wrapper** — `capacitor.config.ts:26` aponta `webDir` para `.next/static` (sem index.html); sem rede na abertura, tela de erro do sistema.
- **A-P3. Push inexistente no binário das lojas** — `@capacitor/push-notifications` não está em nenhum package.json, nenhum código persiste device token; os callbacks APNs do AppDelegate são código morto.

**Testes**
- **A-T1. 2 das 11 falhas "baseline" são drift real de regra de negócio** — `mktClassify` devolve `madeiras_metais` para "Esmalte sintético" e `estetica_automotiva` para "Vonixx"; o teste afirma o comportamento antigo e ninguém sabe qual é o certo. Decidir com o dono do produto; nunca manter falha "conhecida" na suíte.
- **A-T2. Rotas sensíveis sem teste de rota** — `auth/set-session-cookie` (o cookie que habilita todo o `/admin/*`), `whatsapp/webhook` (rota; o service é testado), `delete-account` (LGPD), personas de IA. O harness `__tests__/api/_helpers.ts` já existe.
- **A-T3. ESLint decorativo** — `ignoreDuringBuilds: true` + CI vermelho = 13 erros e 22 warnings (incluindo `exhaustive-deps` nas personas) vivem indefinidamente.

---

## 4. Achados MÉDIOS (seleção, 18)

**Segurança/API:** rate limit fail-open em todas as camadas (erro de RPC/sem IP → `allowed`, IP ausente vira bucket global `'unknown'`; sem evidência de WAF configurado no CF) · `assertProductionEnvs` lê `process.env` no module-load de `security.ts` (padrão banido pelo próprio repo) · 24 rotas sem schema Zod, com campos crus repassados a prompts de IA · `MIN_AGE=18` em `lib/schemas.ts:296` enquanto CLAUDE.md/RELEASE_AUDIT documentam gate de 16 (divergência doc↔código a decidir).

**Dados:** INSERT em `messages` só valida `sender_id` — qualquer autenticado injeta mensagem em conversa alheia (a Wave 35 fechou só a leitura) · chat sobre `conversation_id` texto com 3 formatos ad-hoc e estado inferido por mensagem-marcador `__STORE_ADDED__` — dívida arquitetural (criar `conversations`+`participants`) · `comments_select_auth USING (true)` expõe comments soft-deleted via REST · soft delete desigual (`quotes` tem coluna e policy mas nenhum service usa) · regras duplicadas TS↔SQL sem teste de paridade (o precedente `is_portal_admin` mostra o risco) · `supabase_init.sql` (92KB) é fonte de verdade concorrente **perigosa de rodar** (regrediria policies endurecidas; precisa de banner "NÃO RODAR").

**Frontend:** 17 componentes chamam `getSupabase()` direto (PostCard reimplementa `reportPost` que já existe no service) · modais sem focus trap/restauração de foco (BottomSheet/Dialog, transversal) · zero `loading.tsx` e um único `error.tsx` na raiz (erro de página derruba o chrome inteiro) · componentes mortos (PostActions 190 linhas, NotificationBadge) · 1.016 blocos de `style={{}}` competindo com Tailwind (escapam do dark mode por tokens).

**Plataforma/Legado:** `robots.txt` 404 em produção (criar `app/robots.ts`; mesmo mecanismo do C2) · `NEXT_PUBLIC_VAPID_PUBLIC_KEY` em `[vars]` do wrangler.toml não chega ao build (provável causa raiz do "PushOptIn não aparece") · risco Apple 4.2 (wrapper sem capability nativa) + docs de build com Bundle ID divergente · fallback local da Arte IG aponta para `/style-refs/` que não existe no deploy · workflow de load-test roda arquivo inexistente · `openapi.yaml` duplicado e divergente (raiz vs next-app) · ~2,5 MB de arquivos mortos na raiz (products/ 1,5MB, liquidmetal.jsx 364KB, import_produtos.sql 105KB…) · CLAUDE.md com instruções ativas sobre arquivos deletados (cache-busting de `app.js`/`head.js` da raiz, CACHE_VERSION dito "quc-v3" quando o real é `quc-v4`).

**Testes/CI:** fake supabase duplicado à mão em cada arquivo (causa de 6 das 11 falhas — extrair mock compartilhado com Proxy) · cobertura de UI quase nula (4/40 componentes, 2/50 hooks — justamente a camada dos bugs de WebView do histórico) · 21/50 services sem teste (incluindo consent/LGPD e boost/dinheiro) · zero e2e/smoke (os bugs mais caros do histórico só e2e pega; a infra de preview deploy já existe) · sem medição de cobertura · `typecheck.yml` duplica o ci.yml · `rollback.yml` com premissa desatualizada sobre o deploy.

## 5. Achados BAIXOS (seleção)

Injeção leve de filtro PostgREST em `listUsers`/`errors-list` (admin-only) · `verifyAdminToken` vaza corpo de erro do Supabase Auth ao cliente · HMAC do MP sem janela de frescor do `ts` (replay re-estende PRO) · `SKIP_WAITING` automático do SW troca versão no meio da sessão · cache de GETs de `/api` não segregado por sessão (limpar no signOut) · `share_target` do manifest aponta para rota que ignora os parâmetros · `Info.plist` com `armv7` obsoleto e `NSUserTrackingUsageDescription` sem ATT · `tracesSampleRate: 1.0` no client (quota Sentry) · `deploy.yml` usa `npm install` em vez de `npm ci` · `.eslintrc.cjs` da raiz é código morto (~400 linhas) · fallbacks legados do feed/conversas prontos para aposentar (telemetria existe, falta decidir) · URL do Supabase hardcoded como fallback silencioso · deps duplicadas raiz vs next-app (Capacitor, typescript) e 33 pacotes desatualizados (majors: Capacitor 6→8, Sentry 8→10, zod 3→4, vitest 2→4, wrangler 3→4).

---

## 6. Plano de ação priorizado

**P0 — esta semana (segurança/custo em produção):**
1. C1 — fechar `gateProAI`/`gateProAIForm` para anônimo (1 arquivo, ~10 linhas + testes no harness existente).
2. C2 — `next-app/public/_headers` com a CSP + validar com `curl -I` em produção; criar `app/robots.ts` de carona.
3. C3 — rodar o `DROP POLICY` de quotes no SQL Editor (SQL na seção 2).
4. C6 — `npm audit fix` + upgrade jspdf 4.x.
5. A-D1 — conferir e recriar `is_portal_admin()` com o padrão `to_jsonb`; remover `is_admin` do select de `auth-server.ts`.

**P1 — próximas 2 semanas (confiabilidade operacional):**
6. C5 — zerar as 11 falhas de teste + 13 erros de lint; CI em push para `main`; branch protection.
7. A-S1/A-S2 — varredura única `process.env` → `getRuntimeEnv` (MP primeiro) + regra de lint.
8. A-L1 — mover o signup por convite do portal para rota server-side.
9. A-L2 — script `build-portal.mjs` versionado.
10. A-D3 — adotar controle de migração aplicada (mínimo: tabela `applied_migrations` + renomear migrations com prefixo sequencial).
11. A-D4 — regenerar `database.types.ts` e eliminar os 77 casts.

**P2 — próximo ciclo (dívida estrutural):**
12. A-F1 — unificar as 4 personas em `useAiPersona`/`AiPersonaChat`.
13. A-F2 — layout de grupo `(private)` com chrome mount-once + `error.tsx`/`loading.tsx`.
14. A-F3/A-F4 — fatiar god components; busca da loja server-side.
15. Mobile (C4 + A-P1/P2/P3) — pacote único de "prontidão de loja": um applicationId, `@capacitor/browser` no OAuth, push nativo, shell offline. Só então submeter.
16. A-L3 + limpeza — `docs/history/`, deletar os ~2,5 MB mortos, README novo, banner no `supabase_init.sql`.
17. Chat: projetar `conversations`+`participants` (fecha também o INSERT aberto de `messages`).
18. E2E: 1 smoke Playwright (login→feed→post) contra o preview deploy.

---

## 7. O que está comprovadamente bom (manter)

- Service worker `quc-v4` (anti-envenenamento, retry, fallback offline gerado na hora) — referência.
- Webhooks MP/WhatsApp: HMAC sobre raw body, constant-time, fail-closed, idempotência, anti-retry-storm.
- Trilha de auditoria com modo `critical` fail-closed (LGPD/financeiro).
- Padrão RSC-shell + TanStack Query com optimistic updates canônicos e cache persistido com allowlist.
- Migrations com post-mortem embutido e idempotência; índices parciais dirigidos por query real.
- Contract tests que leem fonte (SRI do portal, tour, sw.js) — cada um nasceu de bug real de produção.
- Sentry com scrubbing recursivo de PII; TypeScript strict com zero erros; suíte de 1.163 testes em ~15s.

*Relatórios completos por camada (com todos os achados e números) gerados durante esta auditoria; este documento é a consolidação deduplicada. Auditoria 100% estática + execução local de testes; nenhum acesso ao banco de produção foi feito — os achados de RLS (C3, A-D1) incluem o SQL de verificação para você rodar no SQL Editor.*
