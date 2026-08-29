-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 47 (2026-08-29) — configuração da IA do WhatsApp em tabela
-- PRÓPRIA (sai do `app_settings`).
--
-- Por que mudar: o portal precisa ESCREVER essa config (botão 24h ×
-- horário comercial), e o `app_settings` recusou — corretamente. Aquela
-- tabela guarda segredo de sistema (`push_internal_secret`,
-- `push_notify_url`); liberar escrita — e principalmente leitura — pro
-- portal ali seria expor segredo pra tirar um botão do lugar.
--
-- Tabela de UMA linha só (id fixo em 1), RLS de portal admin.
--   hours      '8-19' comercial (padrão) | '0-24' sempre | '8-19 +dom'
--   default_on IA ligada por padrão em conversa nova?
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_ai_config (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hours       text    NOT NULL DEFAULT '8-19',
  default_on  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_ai_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_ai_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_ai_config_portal ON public.whatsapp_ai_config;
CREATE POLICY whatsapp_ai_config_portal ON public.whatsapp_ai_config
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- Colunas de diagnóstico: por que a IA ficou calada nesta conversa.
ALTER TABLE public.whatsapp_ai_state
  ADD COLUMN IF NOT EXISTS last_why text,
  ADD COLUMN IF NOT EXISTS last_at  timestamptz;

-- ── Verificação ──
SELECT hours, default_on FROM public.whatsapp_ai_config WHERE id = 1;
