-- SQL Wave 36 (2026-08-22) — mensagem de chat vira notificação (e, com a
-- Wave 30 ligada, vira push no celular).
--
-- Buraco que isto fecha: o gatilho de push escuta a tabela `notifications`,
-- mas só CURTIDA e COMENTÁRIO criam linha lá (triggers em `likes` e
-- `comments`). Mensagem de chat não criava nenhuma — então, mesmo com o push
-- todo configurado, mensagem nunca chegaria no aparelho. Que é justamente o
-- caso mais importante.
--
-- Duas decisões que valem explicação:
--
--   1. AGRUPA RAJADA. Uma linha por mensagem transformaria 20 linhas
--      digitadas em 20 notificações (e 20 pushes). Se já existe aviso NÃO
--      LIDO do mesmo remetente nos últimos 5 minutos, não cria outro. Quem
--      abre o app e lê zera o contador, e a próxima mensagem volta a avisar.
--
--   2. NUNCA DERRUBA O CHAT. O trigger roda AFTER INSERT em `messages`: se
--      ele estourar, a mensagem inteira falha. Por isso o corpo termina com
--      `exception when others then return new` — falha em notificar é
--      irrelevante perto de perder a mensagem.

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_label text;
  v_preview     text;
  v_recentes    int;
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

  SELECT COUNT(*) INTO v_recentes
    FROM public.notifications n
   WHERE n.user_id = NEW.receiver_id
     AND n.actor_id = NEW.sender_id
     AND n.type = 'message'
     AND COALESCE(n.read, false) = false
     AND n.created_at > now() - interval '5 minutes';
  IF v_recentes > 0 THEN
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
  -- Ver decisão 2 no cabeçalho.
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_on_message ON public.messages;
CREATE TRIGGER trg_notify_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- ─────────────────────────────────────────────────────────────────────────
-- Push abre a tela certa. A versão da Wave 30 mandava todo mundo pra
-- `/notificacoes`; mensagem faz mais sentido abrir o chat. O resto do corpo
-- é idêntico ao da Wave 30 (roda depois dela, ou junto).

CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_target text;
BEGIN
  SELECT value INTO v_url    FROM app_settings WHERE key = 'push_notify_url';
  SELECT value INTO v_secret FROM app_settings WHERE key = 'push_internal_secret';
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;
  END IF;

  v_target := CASE WHEN NEW.type = 'message' THEN '/chat' ELSE '/notificacoes' END;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := jsonb_build_object(
      'userIds', jsonb_build_array(NEW.user_id::text),
      'title',   COALESCE(NEW.title, 'QueroUmaCor'),
      'body',    COALESCE(NEW.body, ''),
      'url',     v_target
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Best-effort: falha de rede/pg_net não pode bloquear o insert do aviso.
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Conferência (só leitura).

SELECT tgname FROM pg_trigger
 WHERE tgname IN ('trg_notify_on_message', 'trg_dispatch_push_notification')
 ORDER BY tgname;
