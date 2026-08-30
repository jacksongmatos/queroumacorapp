-- ════════════════════════════════════════════════════════════════════
-- Wave 56 (2026-08-30) — PDF dizia "Cliente não informado" em pedido
-- feito por cliente LOGADO.
--
-- create_quote_from_post grava client_id = auth.uid() mas nunca
-- preencheu client_name/client_phone — e o PDF (e o cabeçalho da tela)
-- leem o NOME. A informação sempre existiu em profiles; só não era
-- copiada pro orçamento no momento do pedido.
--
-- Copiar (e não ler por join na exibição) é decisão: orçamento é
-- registro comercial — o nome no documento deve ser o da ÉPOCA do
-- pedido, imune a renomeações futuras do perfil.
--
-- (1) recria a RPC preenchendo nome/telefone do perfil de quem pede;
-- (2) backfill dos orçamentos existentes com client_id e sem nome.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_quote_from_post(
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
DECLARE
  v_id   uuid;
  v_nome text;
  v_fone text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para solicitar orçamento'; END IF;
  IF p_painter_id IS NOT NULL AND p_painter_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode pedir orçamento para si mesmo';
  END IF;

  -- Nome e telefone de quem está pedindo, congelados no orçamento.
  SELECT NULLIF(TRIM(COALESCE(p.name, '')), ''),
         NULLIF(TRIM(COALESCE(p.phone, '')), '')
    INTO v_nome, v_fone
    FROM public.profiles p
   WHERE p.id = auth.uid();

  INSERT INTO public.quotes (
    client_id, client_name, client_phone,
    painter_id, post_id, title, service_type, area_m2, address,
    description, proposed_date, images, lead_type, status, created_at
  ) VALUES (
    auth.uid(), v_nome, v_fone,
    p_painter_id, p_post_id,
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

-- ── Backfill: orçamento com dono conhecido e nome vazio ──
UPDATE public.quotes q
   SET client_name  = COALESCE(NULLIF(TRIM(q.client_name), ''), NULLIF(TRIM(p.name), '')),
       client_phone = COALESCE(NULLIF(TRIM(q.client_phone), ''), NULLIF(TRIM(p.phone), ''))
  FROM public.profiles p
 WHERE p.id = q.client_id
   AND q.client_id IS NOT NULL
   AND (q.client_name IS NULL OR TRIM(q.client_name) = '');

-- ── Verificação ──
SELECT
  (SELECT count(*) FROM public.quotes
    WHERE client_id IS NOT NULL
      AND (client_name IS NULL OR TRIM(client_name) = '')) AS ainda_sem_nome,
  (SELECT count(*) FROM public.quotes
    WHERE client_id IS NOT NULL AND client_name IS NOT NULL) AS com_nome;
