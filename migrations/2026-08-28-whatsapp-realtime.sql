-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 45 (2026-08-28) — realtime na tabela whatsapp_messages.
--
-- Sem isso, a aba WhatsApp do portal só descobre mensagem nova no poll
-- (a cada 15s antes, 60s agora) — a mensagem já estava no banco em ~2s,
-- mas levava até 15s pra aparecer na tela. Com a tabela na publication
-- do Supabase Realtime, o banco AVISA o portal e a mensagem entra em
-- ~1s, sem repintar a tela (só a linha nova entra na lista).
--
-- Segurança: Realtime respeita RLS. A policy de SELECT de
-- whatsapp_messages (Wave 38) é `is_portal_admin()`, então SÓ admin do
-- portal recebe os eventos — cliente comum logado no app não vê nada.
--
-- REPLICA IDENTITY FULL: sem isso o payload de UPDATE/DELETE vem só com
-- a PK. Pra INSERT (nosso caso) não muda nada, mas deixa o canal pronto
-- caso um dia a gente escute edição/remoção.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
    RAISE NOTICE 'whatsapp_messages adicionada ao supabase_realtime';
  ELSE
    RAISE NOTICE 'whatsapp_messages JA estava na publication — nada a fazer';
  END IF;
END $$;

-- ── Verificação: deve retornar 1 linha ──
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'whatsapp_messages';
