-- SQL Wave 34 (2026-08-21) — D1 do BACKLOG.md: trava `posts.for_sale` no banco.
--
-- Contexto: `canMarkPostForSale` (next-app/lib/policies.ts) esconde o
-- "Marcar como venda" de quem tem role='cliente', e o Composer reconfere a
-- permissão no publish. Mas o INSERT em `posts` sai do BROWSER direto pro
-- Supabase — quem chamar a API com o próprio token grava `for_sale=true`
-- + `price` sem passar pelo app. Esta migration move a regra pro banco.
--
-- Forma: trigger BEFORE INSERT OR UPDATE que ZERA os campos de venda em vez
-- de dar erro. Motivos:
--   - o app nunca manda for_sale pra cliente, então um erro só apareceria
--     pra quem está burlando — e aí falhar silencioso é melhor do que
--     devolver mensagem que ensina onde está a checagem;
--   - mesmo padrão do `protect_profile_columns` (Wave 3), que reverte o
--     campo protegido em vez de abortar a transação.
--
-- Paridade com o cliente: admin (is_admin / role='admin' / portal_access)
-- passa, igual ao `canMarkPostForSale`. Role vazio TAMBÉM passa — contas
-- antigas ficaram sem `role` e não podem regredir (mesma regra por exclusão
-- do TS: nega só quem é explicitamente 'cliente').
--
-- Perf: o SELECT em profiles só roda quando a linha traz algo de venda —
-- post normal (a esmagadora maioria) não paga nada.
--
-- SECURITY DEFINER porque a função lê `profiles`, que tem RLS; sem isso a
-- leitura poderia voltar vazia e a trava abriria sozinha (fail-open).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Função

CREATE OR REPLACE FUNCTION public.enforce_post_for_sale_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role     text;
  v_is_admin boolean;
BEGIN
  -- Nada de venda na linha: caminho rápido, sem tocar em profiles.
  IF COALESCE(NEW.for_sale, false) IS NOT TRUE
     AND NEW.price IS NULL
     AND NEW.art_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT LOWER(COALESCE(p.role, p.user_type, '')),
         (p.is_admin IS TRUE OR p.role = 'admin' OR p.portal_access IS TRUE)
    INTO v_role, v_is_admin
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  IF v_role = 'cliente' THEN
    NEW.for_sale := false;
    NEW.price    := NULL;
    NEW.art_type := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Trigger (idempotente — pode rodar de novo sem duplicar)

DROP TRIGGER IF EXISTS trg_enforce_post_for_sale_role ON public.posts;
CREATE TRIGGER trg_enforce_post_for_sale_role
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_post_for_sale_role();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Diagnóstico: quantos posts JÁ existem violando a regra?
--    Só leitura — a trigger vale daqui pra frente, não mexe no passado.

SELECT COUNT(*) AS posts_de_cliente_marcados_como_venda
  FROM public.posts po
  JOIN public.profiles p ON p.id = po.user_id
 WHERE po.for_sale IS TRUE
   AND LOWER(COALESCE(p.role, p.user_type, '')) = 'cliente'
   AND p.is_admin IS NOT TRUE
   AND p.portal_access IS NOT TRUE;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) OPCIONAL — limpar o histórico. Rode SÓ se o passo 3 acusar linhas e
--    você decidir apagar esses anúncios. É destrutivo (perde price/art_type
--    dessas linhas) e não tem undo. Descomente pra executar:
--
-- UPDATE public.posts po
--    SET for_sale = false, price = NULL, art_type = NULL
--   FROM public.profiles p
--  WHERE p.id = po.user_id
--    AND po.for_sale IS TRUE
--    AND LOWER(COALESCE(p.role, p.user_type, '')) = 'cliente'
--    AND p.is_admin IS NOT TRUE
--    AND p.portal_access IS NOT TRUE;
