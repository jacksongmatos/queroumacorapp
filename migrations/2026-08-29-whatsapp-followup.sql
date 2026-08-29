-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 48 (2026-08-29) — FOLLOW-UP AUTOMÁTICO do WhatsApp.
--
-- Até aqui tudo dependia de o cliente escrever de novo. Se ele sumia, ou
-- se a loja esquecia um pedido de preço, ninguém era lembrado. Esta wave
-- liga uma varredura de hora em hora que olha TODAS as conversas já
-- existentes (não só as novas) e:
--
--   1. atualiza o alerta parado pra "sem resposta há Xh" (cutucão interno,
--      a qualquer hora);
--   2. avisa o cliente UMA vez que o pedido dele está na fila (só em
--      horário de atendimento);
--   3. reengaja quem sumiu depois que a loja falou por último — inclui o
--      lead que nunca respondeu à abordagem (1 toque por semana, no máx).
--
-- Quem nunca recebe nada: quem pediu PARE e a conversa em que o operador
-- desligou a chave da IA na mão.
--
-- ── CORREÇÃO IMPORTANTE NESTA WAVE ──
-- `whatsapp_ai_state.enabled` era NOT NULL DEFAULT false, mas VÁRIAS
-- escritas criam a linha de raspão (registro da última decisão da IA,
-- marca de follow-up). Cada uma dessas linhas nascia com enabled=false —
-- ou seja, a conversa ficava com a IA DESLIGADA sem ninguém ter pedido
-- (invisível hoje só porque o padrão global também é 'desligado'). Agora
-- NULL = "nunca foi decidido nesta conversa" → vale o padrão global.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Chave da conversa: NULL passa a significar "segue o padrão" ──
ALTER TABLE public.whatsapp_ai_state
  ALTER COLUMN enabled DROP NOT NULL,
  ALTER COLUMN enabled DROP DEFAULT;

ALTER TABLE public.whatsapp_ai_state
  ADD COLUMN IF NOT EXISTS opted_out     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_at   timestamptz,
  ADD COLUMN IF NOT EXISTS followup_kind text,
  -- Última mensagem de AUSÊNCIA ("obrigado pelo contato, retornamos em
  -- breve") mandada nesta conversa. Uma a cada 12h, no máximo.
  ADD COLUMN IF NOT EXISTS away_at       timestamptz,
  -- Até quando o OPERADOR já leu esta conversa. A IA responder NÃO conta
  -- como lida: é o que faz o contador de não lidas na lista do portal.
  ADD COLUMN IF NOT EXISTS last_read_at  timestamptz;

-- Backfill do opt-out a partir dos alertas de PARE já registrados.
UPDATE public.whatsapp_ai_state s
   SET opted_out = true
 WHERE s.opted_out = false
   AND EXISTS (
     SELECT 1 FROM public.portal_alerts a
      WHERE a.wa_id = s.wa_id AND a.title ILIKE '%PARE%'
   );

-- Linhas com enabled=false que NÃO vieram de um PARE são resíduo da
-- escrita de raspão descrita acima (desligar uma conversa era no-op, já
-- que o padrão global é 'desligado'). Voltam pra NULL — senão a varredura
-- entenderia "o operador assumiu" e nunca faria follow-up nelas.
UPDATE public.whatsapp_ai_state
   SET enabled = NULL
 WHERE enabled = false AND opted_out = false;

-- ── 2. Config da varredura (mesma linha única da Wave 47) ──
ALTER TABLE public.whatsapp_ai_config
  ADD COLUMN IF NOT EXISTS followup_on     boolean NOT NULL DEFAULT true,
  -- horas de pendência aberta SEM resposta de gente até cobrar
  ADD COLUMN IF NOT EXISTS followup_hours  int     NOT NULL DEFAULT 3,
  -- horas de silêncio do cliente até o toque de reengajamento
  ADD COLUMN IF NOT EXISTS nudge_hours     int     NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS last_sweep_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_sweep_note text,
  -- MENSAGEM DE AUSÊNCIA: quando a IA não vai responder (fora do horário
  -- ou chave desligada), o cliente recebe UMA cortesia da loja em vez de
  -- silêncio. `away_text` NULL = usa o texto padrão do código.
  ADD COLUMN IF NOT EXISTS away_on        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS away_text      text;

-- ── 3. Alerta lembra se o cliente já foi avisado (cobra 1 vez só) ──
ALTER TABLE public.portal_alerts
  ADD COLUMN IF NOT EXISTS followed_up_at timestamptz;

-- ── 4. Agendamento: pg_cron chama a rota do app via pg_net ──
-- A URL COM O TOKEN mora em `app_settings` (RLS bloqueia leitura do
-- portal). Sem ela cadastrada, a função é no-op e o botão "🔁 Follow-up
-- agora" do portal segue funcionando na mão.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.run_whatsapp_followup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
BEGIN
  SELECT value INTO v_url FROM public.app_settings WHERE key = 'whatsapp_followup_url';
  IF v_url IS NULL OR v_url = '' THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_whatsapp_followup() FROM public;
GRANT EXECUTE ON FUNCTION public.run_whatsapp_followup() TO service_role;

-- ⚠️ TROQUE <SEU_EVOLUTION_WEBHOOK_TOKEN> pelo valor da env
--    EVOLUTION_WEBHOOK_TOKEN do Cloudflare Pages (o MESMO do webhook).
INSERT INTO public.app_settings (key, value)
VALUES (
  'whatsapp_followup_url',
  'https://www.queroumacor.com.br/api/whatsapp-evo/followup?token=<SEU_EVOLUTION_WEBHOOK_TOKEN>'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- De hora em hora, aos 10 minutos. `cron.schedule` substitui job de
-- mesmo nome (idempotente).
SELECT cron.schedule(
  'whatsapp-followup-hourly',
  '10 * * * *',
  $$SELECT public.run_whatsapp_followup();$$
);

-- ── Verificação ──
SELECT
  (SELECT followup_on FROM public.whatsapp_ai_config WHERE id = 1)          AS followup_ligado,
  (SELECT away_on FROM public.whatsapp_ai_config WHERE id = 1)              AS ausencia_ligada,
  (SELECT followup_hours FROM public.whatsapp_ai_config WHERE id = 1)       AS horas_cobranca,
  (SELECT nudge_hours FROM public.whatsapp_ai_config WHERE id = 1)          AS horas_reengajamento,
  (SELECT count(*) FROM public.whatsapp_ai_state WHERE enabled IS NULL)     AS conversas_no_padrao,
  (SELECT count(*) FROM public.whatsapp_ai_state WHERE opted_out)           AS opt_outs,
  (SELECT value ~ '<SEU_' FROM public.app_settings
    WHERE key = 'whatsapp_followup_url')                                    AS url_ainda_com_placeholder,
  (SELECT count(*) FROM cron.job WHERE jobname = 'whatsapp-followup-hourly') AS cron_agendado;
