# Auditoria — Plataforma (mobile, PWA, deploy/edge)

## Visão geral

Estratégia clara e documentada — web/PWA como produto primário (Next 15 + `@cloudflare/next-on-pages`), wrapper Capacitor iOS e TWA Android como cascas finas apontando pra `https://queroumacor.com.br` — e o código reflete histórico de correções sérias (SW v4 anti-envenenamento, kill-switch de IAP, Privacy Manifest completo, CI de build iOS assinado). Duas rachaduras estruturais: (1) o pipeline de deploy publica apenas `next-app/.vercel/output/static`, enquanto o `_headers` com toda a CSP/Permissions-Policy/COOP e o `robots.txt` vivem na raiz e nunca entram no output — a postura de headers documentada em DEPLOYMENT.md muito provavelmente não está no ar; (2) identidade Android fraturada em 3 package IDs (`br.com.queroumacor`, `br.com.queroumacor.app`, `com.calicolors.queroumacor`), quebrando Digital Asset Links da TWA e o Play Billing antes do primeiro upload.

## Pontos fortes

- **`next-app/public/sw.js` de qualidade acima da média**: `isCacheable()` (só 200 same-origin não-redirecionado), `matchUsable()` nunca devolve erro guardado, retry único de navegação, fallback offline `no-store`, bypass de RSC/`_rsc`, LRU manual, `CLEAR_CACHES` self-heal, handlers push defensivos.
- **Kill-switch IAP realmente fail-closed**: sem `IAP_PRODUCTION_VERIFICATION_ENABLED === 'true'` → 503 + audit_log + rate limit 10/IP + auth obrigatória.
- **`billing-platform.ts` bem desenhado**: detecção Capacitor → Digital Goods → UA, limitações comentadas.
- **Sentry com scrubbing real de PII**: `beforeSend` compartilhado (mascara email/telefone/CPF/CNPJ/JWT recursivamente), replay maskAllText+blockAllMedia, replaysSessionSampleRate 0, server/edge 0.1.
- **Middleware mínimo**: só `x-request-id` em `/api/:path*`.
- **Privacy Manifest iOS completo**; AppDelegate com callbacks APNs; CI ios-build.yml restaura arquivos curados e faz archive+upload assinado.
- **Pendências documentadas no próprio código** (webDir, App-Bound Domains) — comentário bate com a realidade.

## Achados

[CRITICO] Headers de segurança (CSP inteira) não são deployados com o app Next — _headers:1 vs next-app/wrangler.toml:4 — Output publicado é `next-app/.vercel/output/static` (só `next-app/public/` + build). Não existe `_headers` em next-app/public/ e nada copia o da raiz. Produção Next roda SEM CSP, sem Permissions-Policy, sem COOP/CORP e sem `Cache-Control: no-store` + CORS restrito em `/api/*` — só os 4 headers de next.config.mjs:42-60. Grave em app com histórico de XSS (CRIT-3) e que confia no `Permissions-Policy: payment=(self)` pro Digital Goods na TWA. — Mover o bloco do `_headers` pra `next-app/public/_headers` ou portar pro `headers()` do next.config; validar com curl em produção.

[CRITICO] Identidade Android fraturada: 3 package IDs + fingerprint placeholder — twa-manifest.json:2,52 vs next-app/public/.well-known/assetlinks.json:6 — twa-manifest declara `com.calicolors.queroumacor` com fingerprint `REPLACE_WITH_REAL_SHA256…`; assetlinks.json deployado declara `br.com.queroumacor`; Capacitor/Info.plist usa `br.com.queroumacor.app`; o verify de Play Billing espera `br.com.queroumacor.app`; PRO_PRODUCT_ID é `com.calicolors.queroumacor.pro.monthly`. TWA construída falha Digital Asset Links (abre com barra de Custom Tabs — rejeição na prática). — Eleger UM applicationId e alinhar tudo (incluindo cert do Play App Signing).

[ALTO] Login Google/Apple quebrado no app empacotado — next-app/components/AuthProvider.tsx:198 — `signInWithOAuth` navega a própria WebView pro provedor; Google recusa (`disallowed_useragent`) e no iOS o App-Bound Domains bloqueia (Info.plist:74-79 só lista queroumacor + supabase). Zero uso de `@capacitor/browser`. Blocker de review. — Implementar @capacitor/browser + deep link (CFBundleURLTypes já existe), ou esconder botões sociais quando `Capacitor.isNativePlatform()`.

[ALTO] Zero fallback offline no wrapper: webDir não é web build — capacitor.config.ts:26 — `next-app/.next/static` sem index.html; sem rede na abertura, tela de erro do sistema. — Gerar shell mínima local (splash + retry) como webDir real, ou aceitar formalmente o risco.

[ALTO] Push inexistente no app das lojas — package.json + PushOptIn.tsx:97-106 — `@capacitor/push-notifications` não está nas deps, nenhum código persiste device token; AppDelegate APNs é código morto. App das lojas não terá NENHUMA notificação. — Instalar plugin + tabela de tokens + envio FCM/APNs, ou registrar known-gap do v1.

[MEDIO] robots.txt não é servido pelo deploy Next — só existe na raiz (fora do output); sem app/robots.ts nem next-app/public/robots.txt. Produção deve responder 404. — Criar next-app/app/robots.ts.

[MEDIO] NEXT_PUBLIC_VAPID_PUBLIC_KEY em [vars] do wrangler.toml não chega no build — wrangler.toml:25 — [vars] vale pra runtime das Functions; NEXT_PUBLIC_* precisa estar no build env do painel. Provável causa raiz do "PushOptIn retorna null". — Setar plaintext no painel CF Pages (Production build env).

[MEDIO] Flag de IAP lida via process.env direto no edge — play-billing-verify/route.ts:95, apple-iap-verify:95 — hoje fail-safe, mas quando a env for setada como secret, não vai ligar. — Trocar por getRuntimeEnv() já.

[MEDIO] Risco Apple 4.2 (wrapper de site) + divergência de Bundle ID nos docs — docs/IOS_BUILD.md:27 manda registrar `com.calicolors.queroumacor` enquanto Info.plist usa `br.com.queroumacor.app`; binário sem capability nativa ativa = perfil clássico de rejeição 4.2. — Alinhar doc; planejar 1-2 integrações nativas reais no primeiro build.

[BAIXO] SKIP_WAITING automático troca SW no meio da sessão — ServiceWorkerRegister.tsx:53 — bump de CACHE_VERSION apaga caches com abas antigas abertas. — Ativar só no próximo load ou toast "Atualizar".

[BAIXO] GETs de /api cacheados em cache compartilhado do origin — sw.js:194-213 — fallback offline pode servir resposta do usuário anterior após logout/login. — Limpar RUNTIME_CACHE no signOut via CLEAR_CACHES.

[BAIXO] share_target aponta pra rota que ignora os parâmetros — manifest.webmanifest:38-46 — `/?share=1` cai em app/page.tsx que só redireciona; conteúdo compartilhado se perde. — Rotear pro Composer ou remover.

[BAIXO] Info.plist: `UIRequiredDeviceCapabilities: armv7` obsoleto (devia ser arm64); `NSUserTrackingUsageDescription` presente com `NSPrivacyTracking=false` e sem ATT. — Corrigir/remover.

[BAIXO] tracesSampleRate 1.0 no client — sentry.client.config.ts:28 — 100% das navegações viram transaction; tracePropagationTargets inclui Supabase (headers sentry-trace em todo request). — Monitorar quota antes de campanha de aquisição.
