-- ════════════════════════════════════════════════════════════════════
-- Wave 53 (2026-08-30) — a coluna `quotes.post_id` não existia.
--
-- Sintoma: "Enviar orçamento" no app morria com
--   ERROR 42703: column "post_id" of relation "quotes" does not exist
--
-- Causa: a Wave 42 (2026-08-28) recriou `create_quote_from_post` passando
-- a GRAVAR `post_id` — a versão anterior recebia `p_post_id` e o jogava
-- fora em silêncio. A migration foi escrita a partir do que o CÓDIGO
-- mandava, não do schema real, e a coluna nunca existiu. Enquanto a RPC
-- ignorava o parâmetro ninguém notava; assim que passou a gravar,
-- estourou na cara do cliente.
--
-- É o MESMO erro de `leads.city` (2026-08-29). Fica a regra: conferir o
-- schema real antes de escrever INSERT — a lista de colunas do código não
-- é a da tabela.
--
-- O que a coluna faz: liga o orçamento ao POST que originou o lead. Sem
-- ela, o filtro de "leads já comprados" (`lib/services/leads.ts`, que faz
-- `.select('post_id').eq('painter_id', …).in('post_id', …)`) nunca casa, e
-- o pintor segue vendo na lista leads que já comprou.
--
-- ON DELETE SET NULL de propósito: post apagado não pode levar junto o
-- orçamento, que é registro comercial.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS post_id uuid;

-- FK só se ainda não houver (a coluna pode ter sido criada solta antes).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'quotes_post_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'quotes'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índice do filtro de leads comprados: (painter_id, post_id) na ordem em
-- que a query filtra. Parcial, porque orçamento sem post é a maioria.
CREATE INDEX IF NOT EXISTS idx_quotes_painter_post
  ON public.quotes (painter_id, post_id)
  WHERE post_id IS NOT NULL;

-- ── Verificação ──
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quotes'
      AND column_name='post_id')                          AS coluna_criada,
  (SELECT count(*) FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='quotes'
      AND constraint_name='quotes_post_id_fkey')          AS fk_criada,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='idx_quotes_painter_post')            AS indice_criado;
