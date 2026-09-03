# QueroUmaCor

PWA brasileira que conecta clientes a pintores, grafiteiros e profissionais
automotivos. Cadastro gratuito, orçamentos por foto, chat em tempo real,
loja de tintas Cali Colors e assinatura PRO. Empacotada também como app
mobile (casca Capacitor iOS + TWA Android).

## Stack

- **App**: Next.js 15 (App Router) + React 19 + TypeScript, em `next-app/`.
  Padrão RSC-shell + client component por rota; estado de servidor via
  TanStack Query.
- **API**: rotas edge em `next-app/app/api/*` (runtime Cloudflare). Usadas só
  pra IA, admin e webhooks — o cliente fala direto com o Supabase (RLS).
- **Banco**: Supabase (Postgres + Auth + Storage + RLS + Realtime).
- **Deploy**: Cloudflare Pages via `@cloudflare/next-on-pages`
  (output `next-app/.vercel/output/static`), automático a partir de `main`.
- **Mobile**: casca Capacitor (`capacitor.config.ts`, `ios/`), TWA Android
  (`twa-manifest.json`). Capacidades nativas ficam atrás de `next-app/lib/native`.
- **Portal da loja**: app React estático em `next-app/public/portal/`.
- **IA**: OpenAI + Gemini (fallback) pra chat, sugestão de cor, arte,
  moderação, legenda, transcrição.

> O SPA vanilla original (index.html + app.js + `functions/api/`) foi
> **removido** — o produto é o `next-app/`. Docs que descreviam aquela
> arquitetura estão em `docs/history/` como histórico.

## Estrutura

```
queroumacorapp/
├── next-app/               # O app (Next.js) — é o que roda em produção
│   ├── app/                # rotas (páginas RSC + app/api/* edge)
│   ├── components/ lib/     # UI, hooks, services, lib/native (ponte nativa)
│   ├── public/portal/       # admin React estático da loja
│   └── __tests__/           # Vitest
├── migrations/             # SQLs incrementais (rodados no Supabase SQL Editor)
├── ios/  capacitor.config.ts  twa-manifest.json   # cascas mobile
├── docs/                   # docs vivos (+ docs/history/ = arquivo)
└── ARCHITECTURE.md  DATABASE.md  DEPLOYMENT.md  CONTRIBUTING.md  BACKLOG.md
```

## Desenvolvimento

```bash
cd next-app
npm install
npm run dev        # servidor de dev
npm test           # Vitest
npm run lint       # ESLint
npx tsc --noEmit   # typecheck
```

## Deploy

Cloudflare Pages, automático a partir de `main` (~90s). PRs ganham preview em
`<branch-slug>.queroumacor-next.pages.dev`. A CI (`.github/workflows/ci.yml`)
roda lint + typecheck + testes; o job `validate` é required na branch
protection de `main`.

## Banco de dados

Mudanças de schema são SQLs idempotentes em `migrations/`, rodados
manualmente no Supabase SQL Editor (não há ferramenta de migration ativa —
ver `migrations/MIGRATIONS.md` pra ordem e cuidados). `supabase_init.sql` é
um snapshot histórico anterior ao hardening — **não rodar** num banco vivo.

## Variáveis de ambiente (Cloudflare Pages)

Segredos vivem no painel do Pages e são lidos por `getRuntimeEnv()` (no edge
do Cloudflare eles NÃO chegam em `process.env`). Principais: `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`, `ADMIN_EMAILS`. Ver `next-app/.env.example`.

## Segurança

- CSP + Permissions-Policy + COOP/CORP no `headers()` do `next.config.mjs`
  (fonte única — o `_headers` da raiz não entra no output do build).
- RLS em todas as tabelas mutáveis pelo cliente; service-role isolada no edge.
- Rotas de IA/admin gated por `lib/api/security.ts`.
- LGPD: política, DPO `loja@calicolors.com.br`, exportação `/api/me-export`,
  exclusão de conta.

## Contato

WhatsApp: (11) 95976-5031 · loja@calicolors.com.br
