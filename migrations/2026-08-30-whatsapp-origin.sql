-- ════════════════════════════════════════════════════════════════════
-- Wave 55 (2026-08-30) — de ONDE saiu cada mensagem do WhatsApp.
--
-- Pedido da loja: marcar quais conversas estão sendo tocadas pelo
-- CELULAR (WhatsApp no aparelho) e quais pelo PORTAL. Até aqui só dava
-- pra separar "gente no portal" (sent_by preenchido) do resto — IA e
-- celular gravavam os dois sent_by NULL, indistinguíveis.
--
-- Coluna nova `origin`: 'portal' | 'ia' | 'celular'. Quem preenche é o
-- código, na gravação: a rota de envio marca portal; o runner da IA (e o
-- follow-up) marca ia; o webhook marca celular em toda 'out' que chega de
-- fora — o eco do que portal/IA enviaram colide no message_id UNIQUE e o
-- ignore-duplicates descarta, então só sobra o que nasceu no aparelho.
--
-- Backfill: só o que dá pra afirmar (sent_by preenchido = portal). O
-- resto do histórico fica NULL e o portal simplesmente não mostra chip —
-- melhor sem etiqueta do que com etiqueta chutada.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IN ('portal', 'ia', 'celular'));

UPDATE public.whatsapp_messages
   SET origin = 'portal'
 WHERE direction = 'out' AND sent_by IS NOT NULL AND origin IS NULL;

-- ── Verificação ──
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whatsapp_messages'
      AND column_name='origin')                       AS coluna_criada,
  (SELECT count(*) FROM public.whatsapp_messages
    WHERE origin = 'portal')                          AS backfill_portal;
