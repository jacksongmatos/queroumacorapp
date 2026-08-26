# Auditoria — Camada de Dados (Supabase)

## Visão geral da camada

A camada de dados é um Supabase (Postgres + Storage + Realtime) consumido direto do browser por um Next.js via um client singleton tipado (`next-app/lib/supabase.ts`), com 50 services em `next-app/lib/services/` + uma fachada legada `lib/db.ts`, hooks TanStack Query (234 usos de `useQuery`/`useMutation` em 50 hooks) e 7 hooks com realtime subscriptions. O schema evoluiu por 53 migrations em "waves" rodadas manualmente no SQL Editor, sem tabela de controle de versão aplicada; o estado do banco é rastreado apenas em prosa no CLAUDE.md ("JÁ EXECUTADO"). A qualidade dos arquivos SQL individualmente é alta (idempotência, comentários com post-mortem, blocos de conferência), mas a orquestração entre eles é o ponto fraco: funções recriadas em múltiplos arquivos do mesmo dia, policies antigas nunca dropadas anulando restrições novas, e drift comprovado entre repo e banco vivo.

**Números:** 53 migrations (+ `supabase_init.sql` de 92KB); 51 módulos de acesso a dados; **77 casts manuais** em 29 dos 50 services; ~34 funções SQL; 15 call sites de RPC (14 RPCs distintas); ~9 tabelas usadas pelos services ausentes de `database.types.ts`; `get_feed_v2` recriada **5 vezes** em 5 arquivos.

## Pontos fortes

- **Idempotência quase universal** nas migrations (`DROP IF EXISTS` + `CREATE OR REPLACE` + `DO $$` guards).
- **Documentação embutida excepcional**: cada migration explica motivação, alternativa rejeitada e pegadinha; SELECTs de conferência no fim.
- **Defense in depth deliberada**: filtro `deleted_at` no client além da RLS; regra "for_sale só profissional" no TS E em trigger; sanitização de search no front + sentinelas no `ts_headline`.
- **Caminho de leitura moderno**: `get_feed_v2` agrega 5 round-trips em 1 RPC, com fallback legacy telemetrado via Sentry breadcrumbs — padrão maduro de strangler.
- **Keyset pagination** no feed e notificações.
- **Storage disciplinado**: path pattern `{userId}/...` com enforcement `split_part` consistente em `posts`, `avatars`, `art-refs`.
- **Índices parciais bem dirigidos** + arquivo de auditoria de planner.
- **Follow-up de segurança real** (correção de `exec_sql`, `search_path` fixado, `security_invoker`).

## Achados

[CRITICO] Policy "View quotes active" (Wave 8) nunca dropada anula o fix LGPD da Wave 27 (B4) — migrations/2026-05-31-soft-delete.sql:106-114 vs migrations/2026-06-10-wave-27-rls-hardening.sql:64-75 — Wave 8 criou `View quotes active` com `USING (deleted_at IS NULL OR client_id = auth.uid() OR ...)`: o primeiro termo concede SELECT de qualquer quote ativa a qualquer usuário. Wave 27 (B4) restringiu quotes a participantes (vazavam telefone/endereço de leads — LGPD), mas só dropou outras 2 policies — nenhuma migration dropa `View quotes active`. Policies permissivas são OR'd: se ambas rodaram, a restrição B4 é letra morta. — Recomendação: `SELECT policyname FROM pg_policies WHERE tablename='quotes'`; se existir, `DROP POLICY "View quotes active" ON public.quotes`.

[ALTO] `is_portal_admin()` provavelmente referencia coluna inexistente `profiles.is_admin` — falha 42703 em runtime em ~13 tabelas com RLS — migrations/2026-06-05-is-portal-admin-permissive.sql:18-30 — A versão Wave 10 (mais recente no repo) faz `WHERE ... is_admin = true`. A Wave 34 provou empiricamente que `profiles.is_admin` NÃO existe. Se a versão viva for a da Wave 10, toda policy com `OR public.is_portal_admin()` (16 migrations; 21 ocorrências no init) estoura ou nega. CLAUDE.md registra como "suspeita aberta" desde 2026-08-21, nunca fechada. Há TRÊS definições divergentes da função (Wave 10, init, padrão to_jsonb). — Recomendação: `SELECT prosrc FROM pg_proc WHERE proname='is_portal_admin'`; recriar com padrão `to_jsonb` da Wave 34; consolidar migration canônica.

[ALTO] `get_feed_v2` definida 5× em 5 arquivos do MESMO dia — ordem lexicográfica regride a versão final — migrations/2026-06-09-{rpc-get-feed-v2, posts-media-dimensions, blocks, boost-trending, feed-verified-fix}.sql — Ordem lógica é 16→17→21→22→23, mas em ordem alfabética `posts-media-dimensions` e `rpc-get-feed-v2` vêm DEPOIS de `feed-verified-fix`: rodar a pasta em ordem de nome termina com `get_feed_v2` sem boost, blocks e verified. — Recomendação: prefixo sequencial nos filenames e/ou migration consolidada marcada como vigente.

[ALTO] Sem ambiente de migração gerenciado — drift real e comprovado entre repo e banco — pasta migrations/ — Sem `schema_migrations`, CLI, CI nem rollback; registro de aplicação é prosa no CLAUDE.md. Drift documentado pelas próprias migrations: policies `"OR true"` no banco sem correspondente no repo; funções no banco ausentes do repo (`sync_profile_following_count`, `exec_sql`); colunas no repo/types ausentes do banco (`is_admin`, `palette`, `country`); Wave 12 existe pra recuperar banco onde Waves 3/8 não rodaram; Wave 30 só existiu "no chat". — Recomendação: adotar `supabase migration`/`db push`, ou no mínimo tabela `applied_migrations` + script de diff (`pg_dump --schema-only` vs repo) periódico.

[ALTO] `database.types.ts` divergente do schema real — 77 casts manuais em 29 services — (a) ~9 tabelas usadas não existem no tipo: `brand_logos`, `feature_flags`, `blocks`, `push_subscriptions`, `invoices`, `ai_usage`, `plan_limits`, `media_review_queue`, `media_hash_blocklist`; (b) o tipo declara `profiles.is_admin: boolean|null`, coluna inexistente — mente nos dois sentidos; (c) só 9 de ~20 RPCs tipadas, padrão `rpcAny` repetido em feed/boost/trending/suggestions/search. — Recomendação: regenerar `supabase gen types` e tratar como artefato de CI.

[MEDIO] Qualquer autenticado pode injetar mensagem em conversa alheia — INSERT só valida `sender_id` — supabase_init.sql:477-479 + Wave 35 — Policy de INSERT não restringe `conversation_id`/`receiver_id`; conv ids deriváveis de UUIDs públicos → atacante insere mensagens no thread A↔B. Wave 35 descreve o vetor mas fechou só a leitura. — Recomendação: `WITH CHECK` exigindo POSITION de auth.uid() e receiver no conversation_id (exceção pro formato `store_`), ou tabela de conversas.

[MEDIO] Arquitetura do chat sobre `conversation_id` texto é frágil por design — 3 formatos ad-hoc (`uuidA_uuidB`, `3way:`, `store_calicolors_<uuid>`), sem tabela conversations/participants, sem FK; participação por POSITION (substring em policy); estado "é 3-way" inferido por mensagem-marcador `__STORE_ADDED__`. Consequências: bug "tela não percebia a loja", impossível 4º participante, fallback de fetchConversations baixa 2×200 msgs e agrupa client-side — conversas fora das últimas 200 somem. — Recomendação: dívida arquitetural; criar `conversations` + `conversation_participants` com backfill.

[MEDIO] `comments_select_auth USING (true)` anula o filtro de soft-delete para autenticados — migrations/2026-06-06-recovery-comments-select.sql:16-19 — OR'd com `View comments active`, qualquer logado lê todos os comments, inclusive soft-deleted, via REST. UI não mostra porque services filtram, mas o dado deletado é exfiltrável. — Recomendação: trocar `USING (true)` por `USING (deleted_at IS NULL)`.

[MEDIO] Soft delete aplicado de forma desigual — Wave 8 deu `deleted_at` a 6 tabelas, mas só posts/comments/messages/notes/checklists têm ciclo completo. `quotes` tem coluna/índice/policy porém nenhum service usa — coluna morta com policy furada. Hard `.delete()` em financeiro.ts:213, formacao.ts:207/282, artReferences.ts:160 (coerente, mas fronteira não documentada). — Recomendação: completar quotes ou reverter; documentar lista de tabelas soft-delete.

[MEDIO] Regras de negócio duplicadas TS ↔ SQL sem teste de paridade — lib/policies.ts ↔ migrations — Pares: `canMarkPostForSale` ↔ trigger Wave 34; `isAdmin` ↔ `is_portal_admin()` (já divergiu de fato); `canSeeProFeature` ↔ `is_pro_active`; role↔user_type; tag↔username. Nada quebra o build quando um lado muda. — Recomendação: testes de paridade lendo o SQL canônico (mesmo padrão do teste do tour).

[MEDIO] `supabase_init.sql` é fonte de verdade concorrente e perigosa de rodar — 92KB, 141 objetos, estado ANTERIOR ao hardening: `is_portal_admin` só-portal_access, products com escrita liberada `WITH CHECK (true)`, messages SELECT sem deleted_at. Usa DROP+CREATE: rodar hoje regrediria policies endurecidas. Sem aviso no cabeçalho. — Recomendação: banner "NÃO RODAR — snapshot histórico" ou mover pra docs/legacy/; substituir por baseline `pg_dump --schema-only` datado.

[BAIXO] Fallbacks legados dobram a superfície de manutenção — feed.ts:305-420, chat-conversations.ts:49-140, db.ts:64-88 — corretos, mas cada mudança de shape é 2×. Telemetria pra aposentar existe. — Recomendação: critério de remoção (30 dias só rpc_ok no Sentry) e cumprir.

[BAIXO] Scripts de dados e auditoria misturados na pasta migrations — coral/sherwin-colors, leque-reset, perf-indexes-check ("NÃO É MIGRATION") — quebra automação futura. — Recomendação: subpastas `migrations/data/` e `migrations/checks/`.

[BAIXO] Colunas espelhadas à mão — lib/db.ts:17-21 — `PUBLIC_COLS`/`POST_COLS` "em sync manualmente"; `profiles_public` já perdeu colunas que o código esperava. — Recomendação: lista única exportada ou teste comparando strings.

[BAIXO] URL do Supabase hardcoded como fallback no client — next-app/lib/supabase.ts:38-41 — ambiente mal configurado conversa silenciosamente com produção. — Recomendação: falhar fora de produção quando env ausente.
