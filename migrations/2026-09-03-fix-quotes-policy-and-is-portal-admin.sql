-- 2026-09-03 — Fix dos 2 achados de RLS da auditoria de arquitetura
-- (ARCHITECTURE_AUDIT_2026-08-26.md): C3 e A-D1.
--
-- ═══ PARTE 1 — C3 (CRÍTICO, LGPD): policy legada de quotes ═══════════════
--
-- A Wave 8 (soft delete, 2026-05-31) criou "View quotes active" com
--   USING (deleted_at IS NULL OR client_id = auth.uid() OR ...)
-- O primeiro termo sozinho concede SELECT de QUALQUER quote ativa a QUALQUER
-- usuário autenticado. A Wave 27 (B4) restringiu quotes a participantes
-- (client_id + painter_id + admin) justamente porque vazavam telefone e
-- endereço de leads, mas dropou só as outras 2 policies — e policies
-- permissivas somam por OR, então a restrição ficou letra morta.
-- A visibilidade de soft-deleted pro dono (razão de existir da policy da
-- Wave 8) já é coberta pela policy B4, que não filtra deleted_at.

-- Conferência antes (deve listar "View quotes active" se o furo existe):
SELECT policyname, qual FROM pg_policies WHERE tablename = 'quotes';

DROP POLICY IF EXISTS "View quotes active" ON public.quotes;

-- Conferência depois (a policy não deve mais aparecer):
SELECT policyname FROM pg_policies WHERE tablename = 'quotes';

-- ═══ PARTE 2 — A-D1 (ALTO): is_portal_admin() com coluna fantasma ════════
--
-- A versão da Wave 10 (2026-06-05-is-portal-admin-permissive.sql) referencia
-- `profiles.is_admin` DIRETO no WHERE — e a Wave 34 provou empiricamente que
-- essa coluna NÃO existe na tabela real (erro 42703). Como a função é
-- LANGUAGE sql e ~13 tabelas usam `is_portal_admin()` nas policies, se a
-- versão viva for a da Wave 10, toda avaliação dessas policies falha em
-- runtime. Recriamos com o padrão `to_jsonb` da Wave 34: coluna ausente
-- vira chave ausente → NULL, em vez de abortar. Se `is_admin` um dia for
-- criada, volta a contar automaticamente.

-- Diagnóstico antes (olhe o corpo atual — se contém "is_admin =", está quebrada):
SELECT prosrc FROM pg_proc WHERE proname = 'is_portal_admin';

CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (to_jsonb(p) ->> 'portal_access')::boolean IS TRUE
          OR (to_jsonb(p) ->> 'role') = 'admin'
          OR (to_jsonb(p) ->> 'is_admin')::boolean IS TRUE
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

-- Sem GRANT extra: a função já era chamável pelas policies; SECURITY DEFINER
-- + search_path fixado seguem o padrão dos fixes de 2026-06-18.

-- Conferência final: logado como admin deve dar true; anon/comum, false.
SELECT public.is_portal_admin();
