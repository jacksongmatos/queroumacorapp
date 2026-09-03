-- ════════════════════════════════════════════════════════════════════
-- Wave 51 (2026-08-29) — NÃO LIDAS nos Chats 3-Way do portal.
--
-- O número ao lado de cada conversa era o TOTAL de mensagens dela, e o do
-- menu lateral era o total de linhas da tabela `messages` (o "23"). Nunca
-- baixava, então não dizia nada: abrir a conversa não mudava o número, e
-- não dava pra saber onde tinha gente esperando.
--
-- Esta tabela guarda até quando o PORTAL leu cada conversa — de propósito
-- SEPARADA de `messages.read_at`, que é a marca de leitura do APP (do
-- cliente e do pintor). Se a loja escrevesse ali, ela apagaria a marca de
-- não-lido de quem realmente é destinatário da mensagem.
--
-- A marca é da LOJA, não de cada operador: quem abriu a conversa foi o
-- balcão. Se um dia houver operadores independentes, vira
-- (conversation_id, user_id).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.portal_chat_reads (
  conversation_id text PRIMARY KEY,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid
);

ALTER TABLE public.portal_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_chat_reads_portal ON public.portal_chat_reads;
CREATE POLICY portal_chat_reads_portal ON public.portal_chat_reads
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- ── Verificação ──
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='portal_chat_reads') AS tabela_criada,
  (SELECT count(*) FROM pg_policies
    WHERE tablename='portal_chat_reads')                            AS policies;
