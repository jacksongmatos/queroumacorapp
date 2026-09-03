-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 44 (2026-08-28) — destrava a exclusão de conta: varredura de
-- FKs sem ON DELETE + admin_delete_user v2 (p_force_admin).
--
-- Causa raiz FINALMENTE comprovada (relatório do portal, 2026-08-28):
--   «update or delete on table "profiles" violates foreign key
--    constraint "quotes_painter_id_fkey" on table "quotes"»
-- quotes.painter_id referencia profiles SEM ON DELETE — qualquer conta
-- que já criou/recebeu orçamento não pode ser excluída. Era ISSO que
-- fazia o GoTrue falhar e derrubava o edge com 502 desde o começo.
--
-- (1) Varredura DINÂMICA: acha TODAS as FKs de tabelas do schema public
--     apontando pra profiles(id) ou auth.users(id) com ON DELETE "NO
--     ACTION"/RESTRICT e recria cada uma com a regra:
--       • coluna NULLABLE  → ON DELETE SET NULL (a linha sobrevive —
--         ex.: quote fica pro cliente, sem pintor);
--       • coluna NOT NULL  → ON DELETE CASCADE (linha não existe sem o
--         dono — ex.: like/follow/mensagem do excluído).
--     Só toca em constraints do schema public (NUNCA nas internas do
--     auth/storage). Idempotente: re-rodar não encontra mais nada.
--
-- (2) admin_delete_user v2: novo parâmetro p_force_admin (default
--     false). Sem ele, conta admin/portal segue recusada; com ele
--     (portal manda após confirmação extra), exclui também. A PRÓPRIA
--     conta do caller continua SEMPRE bloqueada.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Varredura de FKs sem ON DELETE ──
DO $$
DECLARE
  r record;
  v_action text;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass  AS tbl,
           c.confrelid::regclass AS reftbl,
           (SELECT a.attname FROM pg_attribute a
              WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1])  AS col,
           (SELECT a.attnotnull FROM pg_attribute a
              WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1])  AS col_notnull,
           (SELECT a.attname FROM pg_attribute a
              WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]) AS refcol
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE c.contype = 'f'
      AND nsp.nspname = 'public'
      AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
      AND c.confdeltype IN ('a', 'r')   -- NO ACTION / RESTRICT
      AND array_length(c.conkey, 1) = 1
  LOOP
    v_action := CASE WHEN r.col_notnull THEN 'CASCADE' ELSE 'SET NULL' END;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s',
      r.tbl, r.conname, r.col, r.reftbl, r.refcol, v_action
    );
    RAISE NOTICE 'FK %.% -> %: ON DELETE %', r.tbl, r.col, r.reftbl, v_action;
  END LOOP;
END $$;

-- ── 2. admin_delete_user v2 (p_force_admin) ──
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid, boolean);

CREATE FUNCTION public.admin_delete_user(
  p_user_id     uuid,
  p_force_admin boolean DEFAULT false
) RETURNS jsonb
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

  IF NOT COALESCE(p_force_admin, false)
     AND v_target IS NOT NULL AND (
       COALESCE((v_target->>'portal_access')::boolean, false)
    OR COALESCE(v_target->>'role', '') = 'admin'
    OR COALESCE((v_target->>'is_admin')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'este perfil tem acesso admin/portal — confirme a exclusão de admin no portal';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, target_table, target_id, changes)
  VALUES (
    v_caller, 'admin.user.delete_user', 'profiles', p_user_id::text,
    jsonb_build_object(
      'deleted', true, 'via', 'rpc admin_delete_user',
      'forced_admin', COALESCE(p_force_admin, false),
      'target_name', v_target->>'name', 'target_tag', v_target->>'tag'
    )
  );

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

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid, boolean) TO authenticated;

-- ── Verificação: nenhuma FK public->profiles/auth.users sem ON DELETE ──
SELECT c.conrelid::regclass AS tabela,
       (SELECT a.attname FROM pg_attribute a
          WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS coluna,
       c.confdeltype AS delete_rule -- esperado: só 'c' (cascade) e 'n' (set null)
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE c.contype = 'f' AND nsp.nspname = 'public'
  AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
ORDER BY 1, 2;
