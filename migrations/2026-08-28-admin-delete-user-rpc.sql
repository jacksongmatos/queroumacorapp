-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 43 (2026-08-28) — RPC admin_delete_user: exclusão permanente
-- de conta DIRETO no banco (portal admin).
--
-- Motivo: a rota /api/admin/users (action delete_user) morria com a
-- página "502 Bad Gateway" DO PRÓPRIO Cloudflare (comprovado pelo corpo
-- capturado no relatório do portal em 2026-08-28) — a function do edge
-- era derrubada no meio da chamada HTTP ao GoTrue, cuja cascata de
-- exclusão é pesada. Esta RPC roda a cascata inteira DENTRO do
-- Postgres: DELETE em auth.users cascateia identities/sessions e (via
-- FK do profiles) todo o rastro do app. Sem HTTP pro Auth, sem edge no
-- caminho.
--
-- Segurança (mesmas guardas da rota):
--   • só portal admin (is_portal_admin(), a MESMA função das policies);
--   • nunca a própria conta;
--   • nunca perfil admin/portal (revogar antes) — colunas lidas via
--     to_jsonb (padrão do repo: coluna ausente vira NULL, não 42703);
--   • trilha em audit_log ANTES do delete.
--
-- Nota: PostgREST corta statements longos (~8s p/ authenticated). Conta
-- de teste exclui em milissegundos; se um dia uma conta GIGANTE estourar
-- o teto, o erro chega CLARO no relatório ("statement timeout") e aí se
-- decide caso a caso (SQL Editor não tem esse teto).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_target     jsonb;
  v_had_auth    boolean := false;
  v_had_profile boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Faça login para excluir contas';
  END IF;
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'não autorizado (precisa de acesso ao portal)';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'userId obrigatório';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'você não pode excluir a própria conta por aqui';
  END IF;

  SELECT to_jsonb(p) INTO v_target FROM public.profiles p WHERE p.id = p_user_id;

  IF v_target IS NOT NULL AND (
       COALESCE((v_target->>'portal_access')::boolean, false)
    OR COALESCE(v_target->>'role', '') = 'admin'
    OR COALESCE((v_target->>'is_admin')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'este perfil tem acesso admin/portal — revogue o acesso antes de excluir';
  END IF;

  -- Trilha ANTES do delete (o actor sobrevive; o alvo vira texto).
  INSERT INTO public.audit_log (actor_id, action, target_table, target_id, changes)
  VALUES (
    v_caller, 'admin.user.delete_user', 'profiles', p_user_id::text,
    jsonb_build_object(
      'deleted', true, 'via', 'rpc admin_delete_user',
      'target_name', v_target->>'name', 'target_tag', v_target->>'tag'
    )
  );

  -- Login primeiro (cascateia o que tiver FK pra auth.users, incluindo
  -- profiles); depois o profile, cobrindo perfil órfão sem login.
  DELETE FROM auth.users WHERE id = p_user_id;
  v_had_auth := FOUND;
  DELETE FROM public.profiles WHERE id = p_user_id;
  v_had_profile := FOUND;

  IF NOT v_had_auth AND NOT v_had_profile AND v_target IS NULL THEN
    RAISE EXCEPTION 'usuário não encontrado (id %)', p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'deleted', p_user_id,
    'auth_deleted', v_had_auth,
    'profile_deleted', v_had_auth OR v_had_profile
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- ── Verificação ──
SELECT p.proname, p.prosecdef AS security_definer,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'admin_delete_user';
