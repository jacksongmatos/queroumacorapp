-- Moderação: admin apaga post de outra pessoa (2026-09-07)
--
-- O app já deixava o admin apagar COMENTÁRIO de qualquer um (Wave 9), mas
-- não POST: mesma tela, duas regras diferentes pro mesmo ato de moderar.
--
-- O `supabase_init.sql` já traz `posts_owner_update` com `is_portal_admin()`,
-- MAS aquele arquivo é a criação do banco do zero — o banco vivo evoluiu por
-- waves incrementais. Já caímos nessa: na Wave 42 as RPCs de orçamento
-- existiam só no init e não no banco, e o INSERT batia na RLS em produção.
-- Então aqui não se assume nada: o bloco 1 LISTA as policies (não pergunta
-- por nome — nome só cobre o que você já sabe que existe, a lição do
-- profiles_role_check em 07/09), o bloco 2 garante a policy, e o bloco 3
-- confere.
--
-- Rodar bloco a bloco no SQL Editor.

-- ── BLOCO 1 — o que existe hoje (só leitura) ────────────────────────────
SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS usando, pg_get_expr(polwithcheck, polrelid) AS com_check FROM pg_policy WHERE polrelid = 'public.posts'::regclass ORDER BY polcmd, polname;

-- Se aparecer alguma linha com polpermissive = false (RESTRICTIVE) em UPDATE,
-- PARE: policy restritiva é AND, não OR, e criar outra não resolve.

-- ── BLOCO 2 — a policy de UPDATE aceitando moderação ────────────────────
DROP POLICY IF EXISTS posts_owner_update ON public.posts;

CREATE POLICY posts_owner_update ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_portal_admin()) WITH CHECK (auth.uid() = user_id OR public.is_portal_admin());

-- ── BLOCO 3 — conferência ───────────────────────────────────────────────
-- `moderacao_ok` só é true se existir policy de UPDATE citando
-- is_portal_admin. Conta a partir do catálogo, não de um nome esperado.
SELECT count(*) FILTER (WHERE polcmd = 'w' AND pg_get_expr(polqual, polrelid) LIKE '%is_portal_admin%') > 0 AS moderacao_ok, count(*) FILTER (WHERE polcmd = 'w' AND NOT polpermissive) AS update_restritivas FROM pg_policy WHERE polrelid = 'public.posts'::regclass;

-- ── BLOCO 4 — a sua conta é admin PRO BANCO? (opcional) ─────────────────
-- O app decide o que mostrar por is_admin/role/portal_access do profile; o
-- banco decide por is_portal_admin(). Divergindo, o botão aparece e o
-- delete devolve zero linhas — que agora vira erro visível na tela, não
-- silêncio, mas o motivo é este.
SELECT public.is_portal_admin() AS sou_admin_pro_banco;
