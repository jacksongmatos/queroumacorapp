-- ════════════════════════════════════════════════════════════════════
-- Wave 56 (2026-08-30) — PDF dizia "Cliente não informado" em pedido
-- feito por cliente LOGADO. JÁ EXECUTADA no Supabase (2026-08-30).
--
-- create_quote_from_post grava client_id = auth.uid() mas nunca
-- preencheu client_name/client_phone — e o PDF (e o cabeçalho da tela)
-- leem o NOME. A informação sempre existiu em profiles; só não era
-- copiada pro orçamento no momento do pedido.
--
-- FORMA FINAL: TRIGGER BEFORE INSERT em quotes (não a recriação da RPC
-- que foi a 1ª tentativa — a colagem do bloco grande pelo celular
-- corrompia; e o trigger é melhor: cobre QUALQUER caminho de criação,
-- presente e futuro, sem depender de cada RPC lembrar de copiar o nome).
--
-- Copiar (e não ler por join na exibição) é decisão: orçamento é
-- registro comercial — o nome no documento é o da ÉPOCA do pedido,
-- imune a renomeações futuras do perfil. Guard: só preenche quando
-- client_id existe E client_name veio vazio (rascunho de pintor com
-- nome digitado passa intocado).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fill_quote_client_info()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND (NEW.client_name IS NULL OR TRIM(NEW.client_name) = '') THEN
    SELECT NULLIF(TRIM(COALESCE(p.name, '')), ''),
           COALESCE(NEW.client_phone, NULLIF(TRIM(COALESCE(p.phone, '')), ''))
      INTO NEW.client_name, NEW.client_phone
      FROM public.profiles p WHERE p.id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_quote_client_info ON public.quotes;
CREATE TRIGGER trg_fill_quote_client_info
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fill_quote_client_info();

-- ── Backfill dos orçamentos existentes ──
UPDATE public.quotes q
   SET client_name  = COALESCE(NULLIF(TRIM(q.client_name), ''), NULLIF(TRIM(p.name), '')),
       client_phone = COALESCE(NULLIF(TRIM(q.client_phone), ''), NULLIF(TRIM(p.phone), ''))
  FROM public.profiles p
 WHERE p.id = q.client_id
   AND (q.client_name IS NULL OR TRIM(q.client_name) = '');

-- ── Verificação ──
SELECT count(*) AS ainda_sem_nome
  FROM public.quotes
 WHERE client_id IS NOT NULL
   AND (client_name IS NULL OR TRIM(client_name) = '');
