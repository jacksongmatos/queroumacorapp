-- ============================================================================
-- SQL Wave 39 (2026-08-28) — Respostas automáticas: consertar persistência
-- e mover o disparo pro banco
--
-- Bug 1 (persistência): `auto_responses` nasceu SEM unique em
-- (user_id, trigger_type), e o app salva com upsert
-- `onConflict: 'user_id,trigger_type'`. O Postgres rejeita com 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") — TODO salvamento falhava silenciosamente e o toggle
-- voltava desligado. Partes 1-2 limpam lixo/duplicatas e criam a UNIQUE.
--
-- Bug 2 (disparo): a auto-resposta rodava no NAVEGADOR do pintor
-- (useChatRealtime) — só respondia com o app aberto naquele instante, que
-- é exatamente o oposto do caso de uso. Parte 3 cria o trigger
-- `trg_auto_reply_on_message`: responde SEMPRE, app aberto ou não.
-- Anti-loop: mensagem que já é auto-resposta nunca gera outra (marcador
-- "🤖 Resposta automática:"), e no máximo 1 auto-resposta por conversa a
-- cada 12h. EXCEPTION WHEN OTHERS: falha na auto-resposta NUNCA derruba o
-- INSERT da mensagem original (mesmo padrão do trg_notify_on_message da
-- Wave 36).
-- ============================================================================

-- ── 1) Limpeza: linhas órfãs e duplicatas ──────────────────────────────────
-- Linhas sem dono/tipo são lixo (nunca casariam com o upsert do app).
DELETE FROM public.auto_responses
 WHERE user_id IS NULL OR trigger_type IS NULL;

-- Duplicatas por (user_id, trigger_type): mantém a mais recente.
DELETE FROM public.auto_responses a
 USING public.auto_responses b
 WHERE a.user_id = b.user_id
   AND a.trigger_type = b.trigger_type
   AND (a.created_at < b.created_at
        OR (a.created_at = b.created_at AND a.id < b.id));

-- ── 2) UNIQUE que o upsert do app exige ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'auto_responses_user_trigger_key'
  ) THEN
    ALTER TABLE public.auto_responses
      ADD CONSTRAINT auto_responses_user_trigger_key
      UNIQUE (user_id, trigger_type);
  END IF;
END $$;

-- ── 3) Disparo server-side: responde mesmo com o app fechado ───────────────
CREATE OR REPLACE FUNCTION public.auto_reply_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template text;
  v_active boolean;
BEGIN
  -- Só conversa 1:1 de verdade.
  IF NEW.sender_id IS NULL OR NEW.receiver_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.sender_id = NEW.receiver_id THEN RETURN NEW; END IF;
  -- Marcadores de sistema e mensagens da loja não são "alguém te escreveu".
  IF COALESCE(NEW.type, 'text') IN ('system', 'store') THEN RETURN NEW; END IF;
  -- ANTI-LOOP: auto-resposta nunca responde auto-resposta (senão dois
  -- pintores com o recurso ligado trocariam mensagens pra sempre).
  IF NEW.content LIKE '🤖 Resposta automática:%' THEN RETURN NEW; END IF;

  SELECT message_template, is_active
    INTO v_template, v_active
    FROM public.auto_responses
   WHERE user_id = NEW.receiver_id
     AND trigger_type = 'new_message'
   LIMIT 1;

  IF NOT COALESCE(v_active, false)
     OR COALESCE(btrim(v_template), '') = '' THEN
    RETURN NEW;
  END IF;

  -- No máximo 1 auto-resposta por conversa a cada 12h (anti-spam: não
  -- responder a CADA mensagem de uma troca ativa).
  IF EXISTS (
    SELECT 1 FROM public.messages m
     WHERE m.conversation_id = NEW.conversation_id
       AND m.sender_id = NEW.receiver_id
       AND m.content LIKE '🤖 Resposta automática:%'
       AND m.created_at > now() - interval '12 hours'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.messages
    (sender_id, receiver_id, conversation_id, content, type)
  VALUES
    (NEW.receiver_id,
     NEW.sender_id,
     NEW.conversation_id,
     '🤖 Resposta automática:' || E'\n' || v_template,
     'text');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Auto-resposta é best-effort: falhar aqui nunca pode custar a mensagem
  -- original.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_reply_on_message ON public.messages;
CREATE TRIGGER trg_auto_reply_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_reply_on_message();
