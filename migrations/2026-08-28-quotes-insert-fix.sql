-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 42 (2026-08-28) — fix "new row violates row-level security
-- policy for table quotes" ao Gravar/Enviar orçamento no app.
--
-- Causa raiz: os DOIS caminhos de criação de orçamento chamam RPCs
-- (create_painter_draft — Orçamento IA "Gravar"/"Enviar para a loja";
-- create_quote_from_post — "Pedir orçamento" no perfil do pintor) que
-- SÓ existem no supabase_init.sql do repo — nenhuma wave incremental
-- os criou/atualizou no banco vivo. A versão viva não é SECURITY
-- DEFINER (ou é anterior), então o INSERT dela cai na RLS de quotes —
-- que desde o hardening NÃO tem mais policy de INSERT direto.
--
-- O fix tem 3 partes, todas idempotentes:
--   1. DROP de TODAS as overloads vivas das 2 funções (qualquer
--      assinatura antiga) + recriação na forma canônica SECURITY
--      DEFINER com search_path fixo.
--   2. Bônus corrigido de passagem: a versão canônica de
--      create_quote_from_post recebia p_post_id e NÃO gravava —
--      o filtro de leads comprados (leads.ts, .eq post_id) nunca
--      casava. Agora grava post_id.
--   3. Policy de INSERT de fallback (defesa em profundidade): cliente
--      cria quote própria; pintor só cria rascunho SEM client_id (não
--      pode fabricar quote "em nome de" um cliente).
-- ════════════════════════════════════════════════════════════════════

-- ── 1a. Derruba TODAS as overloads vivas (assinatura desconhecida) ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_painter_draft', 'create_quote_from_post')
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
    RAISE NOTICE 'dropped %', r.sig;
  END LOOP;
END $$;

-- ── 1b. create_quote_from_post — força client_id = auth.uid() ──
CREATE FUNCTION public.create_quote_from_post(
  p_painter_id    uuid,
  p_post_id       uuid,
  p_title         text,
  p_service_type  text,
  p_area_m2       numeric,
  p_address       text,
  p_description   text,
  p_proposed_date date,
  p_images        jsonb DEFAULT '[]'::jsonb,
  p_lead_type     text  DEFAULT 'direct'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para solicitar orçamento'; END IF;
  IF p_painter_id IS NOT NULL AND p_painter_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode pedir orçamento para si mesmo';
  END IF;
  INSERT INTO public.quotes (
    client_id, painter_id, post_id, title, service_type, area_m2, address,
    description, proposed_date, images, lead_type, status, created_at
  ) VALUES (
    auth.uid(), p_painter_id, p_post_id,
    COALESCE(NULLIF(TRIM(p_title), ''), 'Orçamento'),
    COALESCE(NULLIF(TRIM(p_service_type), ''), 'pintura'),
    p_area_m2, p_address, p_description, p_proposed_date,
    COALESCE(p_images, '[]'::jsonb),
    COALESCE(NULLIF(TRIM(p_lead_type), ''),
      CASE WHEN p_painter_id IS NULL THEN 'shared' ELSE 'direct' END),
    'pending', now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_quote_from_post(uuid, uuid, text, text, numeric, text, text, date, jsonb, text) TO authenticated;

-- ── 1c. create_painter_draft — força painter_id = auth.uid() ──
CREATE FUNCTION public.create_painter_draft(
  p_client_name  text,
  p_service_type text,
  p_title        text,
  p_area_m2      numeric,
  p_price        numeric,
  p_quote_data   jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para salvar rascunho'; END IF;
  INSERT INTO public.quotes (
    painter_id, client_id, client_name, service_type, title,
    area_m2, price, status, quote_data, created_at
  ) VALUES (
    auth.uid(), NULL,
    COALESCE(NULLIF(TRIM(p_client_name), ''), 'Cliente'),
    COALESCE(NULLIF(TRIM(p_service_type), ''), 'Orçamento'),
    COALESCE(NULLIF(TRIM(p_title), ''), 'Orçamento'),
    p_area_m2, COALESCE(p_price, 0), 'rascunho',
    COALESCE(p_quote_data, '{}'::jsonb), now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_painter_draft(text, text, text, numeric, numeric, jsonb) TO authenticated;

-- ── 3. Policy de INSERT fallback (defesa em profundidade) ──
-- Cliente insere quote própria; pintor só insere rascunho SEM client_id
-- (impede fabricar quote "em nome de" outro usuário — a quote aparece
-- na lista do client_id via quotes_own_read).
DROP POLICY IF EXISTS quotes_insert_participants ON public.quotes;
CREATE POLICY quotes_insert_participants ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = client_id
    OR (auth.uid() = painter_id AND client_id IS NULL)
  );

-- ── Verificação (aparece no output do SQL Editor) ──
SELECT p.proname,
       p.prosecdef  AS security_definer,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_painter_draft', 'create_quote_from_post');
