# Auditoria — Testes, CI e Higiene de Engenharia

## Visão geral (medições reais de 2026-08-26)

- Vitest: 11 falharam / 1152 passaram (1163 testes, 95 arquivos), exit 1, ~15-20s. Baseline era 11/1079 — mesmas 11 falhas, suíte cresceu +84.
- tsc --noEmit: 0 erros.
- next lint: 13 erros + 22 warnings, exit 1 (react/no-unescaped-entities ×12 + no-empty-object-type em mediaReviewAdmin.ts:87).
- npm audit --omit=dev: 31 vulns — 1 CRITICAL (jspdf), 8 HIGH (next, sharp, nanoid, fast-uri, postcss, rollup, brace-expansion, @sentry/nextjs), 22 moderate.
- npm outdated: 33 pacotes; majors: Capacitor 6→8, Sentry 8→10, jspdf 2→4, zod 3→4, vitest 2→4, wrangler 3→4, jsdom 25→30; next 15.4.11 atrás do wanted 15.5.24.
- CI: ci.yml roda audit(não-bloq)→lint→typecheck→vitest só em branches ≠ main e PRs; typecheck.yml duplica; NADA roda em push pra main (branches-ignore: [main]); deploy de produção é o build automático do CF Pages sem depender de CI verde. Com lint e vitest em exit 1, CI permanentemente vermelho.

As 11 falhas: chat.test (searchUsers filtro), mkt.test ×9 (2 drifts reais de mktClassify + 7 por fake supabase sem .or()/.gte()), signup.test (metadata birth_date/city/state não atualizado na asserção).

## Pontos fortes

- Suíte grande, rápida, barata: 1163 testes em ~15s, node default + jsdom opt-in.
- API bem coberta em segurança: harness compartilhado __tests__/api/_helpers.ts; testes de fail-closed (security-failclosed, mp-webhook HMAC, audit-critical, sanitize, push-notify-ratelimit).
- Contract tests criativos (portalApiRoutes SRI, tour lê fonte do BusinessGrid, sw.js em escopo falso) — cada um nasceu de bug real.
- TypeScript exemplar: strict + noUnusedLocals/Parameters + noImplicitReturns + noFallthroughCasesInSwitch, zero erros.
- CI com boa higiene de plumbing (permissions read, concurrency, timeouts, cache); ZAP baseline semanal com rules.tsv curado; uptime.yml 10min com issue automática.
- Serviços críticos novos chegam com teste (whatsapp: 22 testes no commit da feature).

## Achados

[CRITICO] Gate de merge inexistente: CI permanentemente vermelho e main sem nenhum check — .github/workflows/ci.yml:7-9 — lint exit 1 (13 erros) e test exit 1 (11 falhas) = todo push vermelho desde sempre; vermelho crônico não distingue regressão nova. `branches-ignore: [main]` = merge em main não roda nada, e o deploy CF Pages não espera CI. — Recomendação: zerar as 11 falhas (1-2h), corrigir 13 erros de lint, rodar CI em push pra main, branch protection exigindo o job validate.

[CRITICO] jspdf 2.5.2 com vulnerabilidade CRITICAL (ReDoS + DoS + LFI/Path Traversal) — next-app/package.json:20 — fix é o major 4.2.1. — Recomendação: upgrade jspdf 4.x (API quase compatível; usos são PDF de orçamento).

[ALTO] 11 falhas aceitas como baseline escondem 2 drifts reais de regra de negócio — mkt.test.ts:199,203 — mktClassify devolve `madeiras_metais` pra "Esmalte sintético" e `estetica_automotiva` pra "Vonixx"; teste afirma o antigo. Ninguém sabe qual é o certo. — Recomendação: decidir com o dono do produto; nunca manter falha "conhecida".

[ALTO] next 15.4.11 com advisories HIGH corrigíveis sem breaking — audit aponta DoS via Image Optimizer e request smuggling; wanted 15.5.24 já tem fix. Idem sharp, nanoid, fast-uri, postcss, brace-expansion. — Recomendação: npm audit fix + npm update no semver; elimina ~7 das 9 HIGH/CRITICAL.

[ALTO] Rotas de API sensíveis sem teste de rota — sem teste: auth/set-session-cookie (cookie que habilita /admin/* — CRIT-4), whatsapp/send e webhook (rota; o service é testado), delete-account (LGPD), receipt-ocr, reverse-geocode, alice, alice/tts, fe, senna. — Recomendação: priorizar set-session-cookie e whatsapp/webhook com o harness existente.

[ALTO] ESLint decorativo: erros não bloqueiam build nem merge — next.config.mjs:28 ignoreDuringBuilds:true + CI vermelho — 13 erros vivem indefinidamente; 22 warnings incluem exhaustive-deps em useFe/useSenna/useSeuZe. — Recomendação: corrigir os 13, manter ignoreDuringBuilds, CI bloqueante.

[MEDIO] Cobertura de UI quase nula: 4/40 componentes e 2/50 hooks — AuthProvider, AppShell, useCart/checkout, StoryViewer, PushOptIn, BottomNav (data-tour) sem rede — a camada dos bugs de WebView/iOS do histórico. — Recomendação: priorizar AuthProvider (timeout 8s), useCart, publish.

[MEDIO] 21/50 services sem teste — blocks, boost, trending, consent (LGPD), points, reviews, checklist, mediaReviewAdmin, adminReports, adminWhatsApp, artReferences, nearbyFeed, suggestions… — Recomendação: cobrir primeiro dinheiro/moderação (boost, mediaReviewAdmin, consent).

[MEDIO] Fake supabase chainable duplicado à mão em cada arquivo — causa direta de 6 das 11 falhas — cada teste redeclara o builder; método novo (.or, .gte) quebra só o fake local. — Recomendação: helper compartilhado (__tests__/_supabaseMock.ts) com Proxy aceitando qualquer chain.

[MEDIO] Nenhuma medição de cobertura — sem @vitest/coverage-v8 nem script. — Recomendação: --coverage no CI, sem threshold no início.

[MEDIO] Zero testes e2e/smoke — dirs tests//e2e/ do eslintrc da raiz não existem mais; nenhum Playwright. Os bugs mais caros do histórico (cache SW, OAuth WebView, 404 do portal) só e2e pega. — Recomendação: 1 smoke Playwright contra o preview deploy (STAGING.md).

[MEDIO] typecheck.yml duplica o typecheck do ci.yml — mesmo trigger, npm ci ~2min 2× por push. — Recomendação: deletar typecheck.yml.

[MEDIO] rollback.yml com premissa desatualizada — diz que force-push "dispara o deploy.yml", mas deploy.yml virou workflow_dispatch-only; rollback depende do build automático do CF Pages. — Recomendação: atualizar comentário e validar 1×.

[BAIXO] deploy.yml usa npm install em vez de npm ci — build não reprodutível contra lockfile. — Recomendação: npm ci.

[BAIXO] .eslintrc.cjs da raiz é código morto (~400 linhas) — linta app vanilla removido; raiz nem tem eslint em devDeps. — Recomendação: deletar .eslintrc.cjs + .eslintignore da raiz.

[BAIXO] Polyfills pinados de workaround antigo — es-abstract, object.fromentries em devDeps (fix da "ESLint dep corruption") — provavelmente desnecessários. — Recomendação: remover e confirmar lint.

[BAIXO] Duplicação de deps raiz vs next-app e majors acumulando — @capacitor/* e typescript nos dois package.json; pin exato @sentry/core@8.55.2 ao lado de ^8.0.0 sem comentário. — Recomendação: consolidar Capacitor; majors em lote separado do audit fix.
