# Auditoria — Legado e Portal

## Visão geral

O cutover vanilla→Next.js foi concluído de fato (não há mais `index.html`/`app.js`/`modules/` na raiz; produção é o build de `next-app/.vercel/output/static`), mas a raiz do repo ficou como um "museu" parcialmente perigoso: **~2,5 MB de arquivos mortos** (destaques: `products/` com 140 webp = 1,5 MB, `Calicolors_liquidmetal_original.jsx` = 364 KB/1.568 linhas, `import_produtos.sql` = 105 KB) e **pelo menos 11 documentos .md obsoletos (~130 KB)** que descrevem uma arquitetura que não existe mais. O achado mais grave não é estético: arquivos operacionais da raiz (`_headers` com a CSP completa, `robots.txt`, `style-refs/`) **estão fora do diretório de output do deploy** e portanto quase certamente não chegam à produção, enquanto `DEPLOYMENT.md` afirma que a CSP está ativa. O portal da loja é um monólito React de arquivo único (`app.jsx` 3.446 linhas/201 KB → `app.js` compilado 8.316 linhas/251 KB) com pipeline de build 100% manual (babel + openssl + bump de `?v=`) cuja única "receita" vive em prosa no CLAUDE.md — mitigado por um teste que valida SRI e rotas (verificado: o hash bate hoje). ~20 arquivos/diretórios mortos e 3 quebras funcionais verificáveis (CSP/headers, robots.txt, fallback de style-refs, workflow de load-test).

## Pontos fortes

- **`ARCHITECTURE.md` está atualizado e correto** (datado 2026-06-14, declara o vanilla removido e descreve o next-app real).
- **`__tests__/portalApiRoutes.test.ts` é uma guarda excelente**: valida URLs `/api/*` do portal contra `route.ts` reais E o hash SRI do `index.html` contra o `app.js` real (recomputado: confere).
- **`next-app/public/sw.js` é exemplar**: 429 linhas comentadas, `CACHE_VERSION = 'quc-v4'` única e consistente.
- **CI enxuto e bem particionado**: ci.yml (lint+test), typecheck.yml, security.yml (npm audit + ZAP semanal), uptime.yml (ping /api/health 10min com issue automática), deploy.yml manual-only com justificativa.
- Portal com `noindex,nofollow`, SRI em todos os scripts, Sentry próprio; teste de rotas cobre `.jsx` e `.js`.
- Repo git leve (pack 3,93 MiB).

## Achados

[CRITICO] Headers de segurança do _headers (CSP inclusa) provavelmente não chegam à produção — _headers:1-9 vs next-app/next.config.mjs:42-61 — O Cloudflare Pages só lê `_headers`/`_redirects` do diretório de output do build (`next-app/.vercel/output/static`, cf. next-app/wrangler.toml:4 e DEPLOY.md:15-16). O `_headers` da raiz — com a CSP completa, Permissions-Policy, COOP/CORP e regras de cache — não está em `next-app/public/` e nenhum passo de build o copia. O `headers()` do next.config reimplementa só 4 headers (nosniff, Referrer-Policy, HSTS, X-Frame-Options) — sem CSP; grep por `Content-Security-Policy` no next-app: vazio. DEPLOYMENT.md:229+ documenta a CSP como ativa. — Recomendação: confirmar com `curl -I https://queroumacor.com.br` (usuário precisa rodar); portar a CSP pro `headers()` do next.config ou criar `next-app/public/_headers`; corrigir DEPLOYMENT.md.

[ALTO] Cadastro por convite do portal grava role='admin' + portal_access=true direto do client — next-app/public/portal/app.jsx:138 e 3341-3346 — `handleCreateAccount` chama `authService.signUpAppUser` com `role:'admin', portalAccess:true` (upsert em `profiles` com anon key). O trigger `protect_profile_columns` (Wave 3) deveria bloquear: ou o fluxo de convite do portal está silenciosamente quebrado, ou existe caminho de escalada validado só client-side (checagem do invite em app.jsx:3323-3327 roda no browser). Além disso consulta a tabela `invites`, não a `invite_codes` da Wave 5. — Recomendação: testar ponta a ponta; mover criação de conta com portal_access pra rota server-side com service_role (padrão `/api/admin/users`).

[ALTO] Pipeline de build do portal é 100% manual e a receita não está versionada — next-app/public/portal/{app.jsx,app.js,index.html} — Compilar exige babel com opções exatas descritas apenas em prosa no CLAUDE.md; depois openssl sha384 manual e bump manual do `?v=` — três passos manuais com modos de falha silenciosos (SRI errado = portal travado em "Carregando…"). Não existe script nem workflow. — Recomendação: commitar `next-app/scripts/build-portal.mjs` que compila, recalcula hash e reescreve `integrity` + `?v=` num comando.

[ALTO] 11+ documentos da raiz descrevem a arquitetura deletada — API.md, AUTH.md, EVENTS.md, KV.md, DEPENDENCIES.md, ARCHITECTURE_PLAN.md, LAYERS.md, README.md — `API.md` documenta `/functions/api/` (não existe), `AUTH.md` aponta pra `head.js`/`modules/signup-flow.js` (deletados), `DEPENDENCIES.md` manda rodar `npm run check:deps` (package.json da raiz sem scripts), e o README.md afirma "Frontend: Vanilla JS + HTML + CSS" e "Backend: Cloudflare Pages Functions". Risco de dev/agente novo consertar no lugar errado. — Recomendação: mover pra `docs/history/` com banner ou deletar; reescrever o README.

[MEDIO] ~2,5 MB de arquivos mortos na raiz — `products/` (140 webp, 1,5 MB, zero refs), `Calicolors_liquidmetal_original.jsx` (364 KB), `import_produtos.sql` (105 KB), `fonts/` (56 KB — layout usa next/font/google), `img/` (144 KB duplicado parcial), ícones duplicados (~122 KB), `sw.js` killswitch, `_layers/` (5 READMEs do vanilla), `.eslintrc.cjs` (linta arquivos inexistentes), `robots.txt`/`sitemap.xml`/`_redirects` da raiz. — Recomendação: commit de limpeza; histórico útil pra `docs/history/` ou via git.

[MEDIO] robots.txt não existe no build de produção — raiz robots.txt vs next-app/app/ — Fora do output; não há `app/robots.ts` (só `app/sitemap.ts`) nem `next-app/public/robots.txt`. Produção deve responder 404 em /robots.txt, contradizendo o Search Console. — Recomendação: criar `next-app/app/robots.ts`.

[MEDIO] Fallback local da Arte IG quebrado — next-app/lib/api/_services/ig-art.ts:110-114 — Referencia `/style-refs/*.jpg`, mas `style-refs/` só existe na raiz (fora do deploy). Fallback é 404 garantido (bucket primário mascara). — Recomendação: copiar pra `next-app/public/style-refs/` ou remover o fallback.

[MEDIO] Workflow de load test roda arquivo inexistente — .github/workflows/load-test.yml:28 — `k6 run scripts/load-test.js`, mas `scripts/` só tem `patch_pbxproj.py`. Falha em qualquer disparo. — Recomendação: restaurar do git ou deletar.

[MEDIO] openapi.yaml duplicado e divergente — openapi.yaml (1.169 linhas, raiz) vs next-app/openapi.yaml (1.533, gerado por script). Duas fontes de verdade. — Recomendação: deletar o da raiz.

[MEDIO] Portal é monólito de arquivo único com React duplicado — app.jsx 3.446 linhas/201 KB, ~398 definições top-level; compilado 8.316 linhas/251 KB não minificado + React 18.3.1 UMD (142 KB) + supabase.js UMD (108 KB), enquanto o app roda React 19. ~600 KB de payload, dois Reacts. Auth razoável (gate client-side + RLS `is_portal_admin()` como enforcement + `/api/admin/users` com accessToken). — Recomendação: planejar migração pra rota admin dentro do next-app (requireAdminServer já existe), eliminando pipeline manual, SRI e React duplicado.

[MEDIO] CLAUDE.md contém instruções ativas sobre arquivos deletados — regra de cache-busting referencia `app.js`/`head.js` da raiz (só vale pro portal); "Fase 4 modularização" descreve `modules/*.js` + `shims.js` deletados como estado atual; Turnstile "carregado no index.html" (zero hits no next-app); CACHE_VERSION dito "quc-v3" quando o real é `quc-v4` (next-app/public/sw.js:35). — Recomendação: passada de revisão marcando itens históricos.

[BAIXO] icon-512.png divergente entre raiz e next-app/public — md5 diferentes; o da raiz é versão antiga, risco de cópia errada em builds mobile. — Recomendação: deletar o da raiz.

[BAIXO] Dois service workers no repo, um morto — sw.js raiz (killswitch, 43 linhas, não servido) vs next-app/public/sw.js (429, servido). — Recomendação: deletar o da raiz com nota no CHANGELOG.

[BAIXO] supabase.js UMD vendorizado pinado em 2.45.0 — next-app/public/supabase.js (108 KB), só o portal usa; atualização de segurança exige re-vendorizar + refazer SRI. — Recomendação: incluir no escopo da migração do portal.
