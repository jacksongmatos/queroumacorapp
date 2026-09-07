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

-- ── PASSO 6 — a sua conta é admin PRO BANCO? ───────────────────────────
-- O app decide o que MOSTRAR por is_admin/role/portal_access do profile; o
-- banco decide quem PODE por is_portal_admin(). Divergindo, o botão aparece
-- e o delete devolve zero linhas — que agora é erro visível na tela, não
-- silêncio, mas o motivo é este.
--
-- ⚠️ NÃO rode `SELECT public.is_portal_admin();` aqui pra responder isso.
-- Foi o que escrevi na 1ª versão e é CHECAGEM ERRADA: no SQL Editor a
-- sessão é `postgres`/`service_role`, `auth.uid()` é NULL, e a função
-- devolve false MESMO com a conta sendo admin. Voltou false em 07/09 e não
-- provou nada. Checagem que responde false pra sempre é pior que checagem
-- nenhuma — ensina a ignorar a checagem (a lição do profiles_role_check).
--
-- O jeito certo é olhar o que a função exige e depois a linha do perfil.
-- `to_jsonb` porque `profiles.is_admin` pode não existir na tabela real, e
-- selecionar coluna ausente aborta com 42703 em vez de devolver NULL.
SELECT prosrc FROM pg_proc WHERE proname = 'is_portal_admin';

SELECT id, to_jsonb(p)->>'email' AS email, to_jsonb(p)->>'role' AS role, to_jsonb(p)->>'user_type' AS user_type, to_jsonb(p)->>'is_admin' AS is_admin, to_jsonb(p)->>'portal_access' AS portal_access FROM public.profiles p WHERE to_jsonb(p)->>'email' = 'jackson.guerra@gmail.com';

-- A prova final, essa sim, é no APARELHO: entrar como admin, abrir o menu
-- de um post de outra pessoa e apagar. Passou = a corrente inteira funciona.
