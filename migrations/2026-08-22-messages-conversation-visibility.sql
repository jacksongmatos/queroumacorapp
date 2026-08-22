-- SQL Wave 35 (2026-08-22) — conversa de 3 realmente visível pros 3.
--
-- Problema: a policy de SELECT em `messages` (Wave 27) libera a linha só pra
-- quem ENVIOU ou quem RECEBEU. Numa conversa 3-way isso quebra: quando a loja
-- responde pelo /portal, o código escolhe UM destinatário
-- (`public/portal/app.jsx` → "primeiro participante que não sou eu"), e o
-- terceiro da conversa não é sender nem receiver — ou seja, não enxerga a
-- mensagem. Na prática cada pessoa vê um pedaço diferente da mesma conversa.
--
-- Fix: quem participa da CONVERSA vê tudo dela. A questão é como definir
-- "participa" sem abrir brecha.
--
-- O caminho óbvio — "tem alguma mensagem sua nessa conversa" — seria um furo
-- de privacidade: o `conversation_id` de um 1:1 é `uuidA_uuidB` ordenado, e
-- os UUIDs são públicos (`profiles`). Qualquer pessoa poderia montar o id da
-- conversa alheia, inserir uma mensagem lá (a policy de INSERT só exige
-- sender_id = auth.uid()) e, com isso, passar a LER todo o histórico dos
-- outros.
--
-- Por isso a regra aqui é ESTRUTURAL, não derivada de dados: você participa
-- se o seu UUID faz parte do próprio `conversation_id`. Todos os formatos em
-- uso derivam dos participantes:
--   `uuidA_uuidB`               1:1
--   `3way:uuidA_uuidB`          1:1 promovido a 3-way
--   `store_calicolors_<uuid>`   conversa direta com a loja
-- Inventar um id contendo o UUID de outra pessoa só daria acesso a ELA, numa
-- conversa que ninguém mais usa — não vaza nada.
--
-- A loja continua lendo tudo por `is_portal_admin()`, como antes.

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT TO authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        sender_id = auth.uid()
        OR receiver_id = auth.uid()
        -- Participante estrutural: o UUID está no id da conversa.
        OR POSITION(auth.uid()::text IN COALESCE(conversation_id, '')) > 0
      )
    )
    OR public.is_portal_admin()
  );

-- A tela de conversa sempre filtra por conversation_id; sem índice, cada
-- abertura vira seq scan na tabela inteira de mensagens.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- Conferência (só leitura). Deve listar a policy nova e o índice.

SELECT policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'messages'
 ORDER BY policyname;

SELECT indexname FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'messages'
   AND indexname = 'idx_messages_conversation_created';
