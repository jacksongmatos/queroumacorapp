-- 2026-09-04 — 1 push POR MENSAGEM (remove o agrupamento de rajada).
--
-- A Wave 36 (2026-08-22) agrupava: se já existisse aviso NÃO LIDO do mesmo
-- remetente nos últimos 5 minutos, a mensagem seguinte não gerava notificação
-- (logo, não gerava push). Decisão do usuário em 2026-09-04: quer 1 push por
-- mensagem, alinhado com curtida e comentário, que já são 1 por evento.
--
-- ÚNICA mudança: o bloco do `v_recentes` saiu. Todo o resto (guardas de
-- self/system/deleted, preview, EXCEPTION WHEN OTHERS) é idêntico.
--
-- TRADE-OFF (era o motivo do agrupamento): quem digitar 20 mensagens seguidas
-- agora gera 20 pushes. Se virar incômodo, o caminho de volta é reintroduzir
-- o bloco removido — ou trocar por uma janela menor (ex.: 30 segundos).
--
-- NÃO mexe em curtida/comentário: `notify_on_like` e `notify_on_comment` já
-- inserem uma linha por evento, sem janela.

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_label text;
  v_preview     text;
BEGIN
  -- Sem destinatário, pra si mesmo, marcador interno ou já apagada: ignora.
  IF NEW.receiver_id IS NULL OR NEW.receiver_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.type, 'text') = 'system' THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_actor_label := public.notif_actor_label(NEW.sender_id);
  v_preview := CASE
    WHEN COALESCE(NEW.type, 'text') <> 'text' THEN 'enviou um anexo'
    WHEN length(COALESCE(NEW.content, '')) > 80
      THEN substring(NEW.content FROM 1 FOR 80) || '…'
    ELSE COALESCE(NEW.content, '')
  END;

  INSERT INTO public.notifications
    (user_id, actor_id, type, title, body, created_at)
  VALUES
    (NEW.receiver_id, NEW.sender_id, 'message',
     'Nova mensagem',
     v_actor_label || ': ' || v_preview,
     now());

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Falha em notificar nunca pode derrubar o INSERT da mensagem.
  RETURN NEW;
END $$;

-- O trigger não muda (já aponta pra esta função), mas recriar é idempotente
-- e garante que está no evento certo.
DROP TRIGGER IF EXISTS trg_notify_on_message ON public.messages;
CREATE TRIGGER trg_notify_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- Conferência (só leitura): deve devolver 1 linha, sem 'v_recentes' no corpo.
SELECT proname,
       (prosrc LIKE '%v_recentes%') AS ainda_agrupa
  FROM pg_proc
 WHERE proname = 'notify_on_message';
