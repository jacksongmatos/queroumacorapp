-- Moderação: admin apaga post de outra pessoa (2026-09-07)
--
-- O app já deixava o admin apagar COMENTÁRIO de qualquer um (Wave 9), mas
-- não POST: mesma tela, duas regras diferentes pro mesmo ato de moderar.
--
-- O `supabase_init.sql` já traz `posts_owner_update` com `is_portal_admin()`,
-- MAS aquele arquivo é a criação do banco do zero — o banco vivo evoluiu por
-- waves incrementais. Já caímos nessa: na Wave 42 as RPCs de orçamento
-- existiam só no init e não no banco, e o INSERT batia na RLS em produção.
--
-- COMO RODAR: **uma instrução por vez**, na ordem. Em 07/09 a colagem do
-- bloco inteiro fez o CREATE rodar sem o DROP e devolveu
-- `42710: policy "posts_owner_update" already exists` — a mesma mordida do
-- editor do Supabase com paste de várias linhas (a do 42601 da Wave 26).
-- Postgres não tem `CREATE POLICY IF NOT EXISTS`, então DROP+CREATE é o
-- único caminho e a ordem importa.

-- ── PASSO 1 — a pergunta que decide tudo (só leitura, uma linha) ────────
-- `moderacao_ok = true` → a policy viva JÁ aceita moderação: PARE AQUI,
-- não há nada a rodar. Só siga pro passo 3 se vier false.
-- `update_restritivas > 0` → PARE também, e por outro motivo: policy
-- RESTRICTIVE é AND, não OR, e criar outra permissiva não resolve.
SELECT count(*) FILTER (WHERE polcmd = 'w' AND pg_get_expr(polqual, polrelid) LIKE '%is_portal_admin%') > 0 AS moderacao_ok, count(*) FILTER (WHERE polcmd = 'w' AND NOT polpermissive) AS update_restritivas FROM pg_policy WHERE polrelid = 'public.posts'::regclass;

-- ── PASSO 2 — detalhe, se quiser ver o texto das policies ──────────────
-- LISTA, não pergunta por nome: nome só cobre o que você já sabe que
-- existe (a lição do profiles_role_check, 07/09/2026).
SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS usando, pg_get_expr(polwithcheck, polrelid) AS com_check FROM pg_policy WHERE polrelid = 'public.posts'::regclass ORDER BY polcmd, polname;

-- ── PASSO 3 — só se `moderacao_ok` veio false. Rode esta linha sozinha ──
DROP POLICY IF EXISTS posts_owner_update ON public.posts;

-- ── PASSO 4 — e depois esta, sozinha ───────────────────────────────────
CREATE POLICY posts_owner_update ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_portal_admin()) WITH CHECK (auth.uid() = user_id OR public.is_portal_admin());

-- ── PASSO 5 — reconferir: rode o PASSO 1 de novo, tem que vir true ─────

-- ── PASSO 6 — opcional: a sua conta é admin PRO BANCO? ─────────────────
-- O app decide o que mostrar por is_admin/role/portal_access do profile; o
-- banco decide por is_portal_admin(). Divergindo, o botão aparece e o
-- delete devolve zero linhas — que agora é erro visível na tela, não
-- silêncio, mas o motivo é este.
SELECT public.is_portal_admin() AS sou_admin_pro_banco;
