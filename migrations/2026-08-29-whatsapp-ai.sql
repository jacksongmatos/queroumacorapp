-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 46 (2026-08-29) — atendimento com IA no WhatsApp do portal.
--
-- Duas tabelas pequenas:
--
-- 1. `whatsapp_ai_state` — a CHAVE liga/desliga por conversa. Sem linha
--    pra um número, vale o padrão global (app_settings
--    'whatsapp_ai_default', 'off' se ausente). Assim dá pra ligar tudo
--    de uma vez OU escolher conversa a conversa, e o operador pode
--    assumir o volante a qualquer momento.
--
-- 2. `portal_alerts` — quando o cliente pede PREÇO ou ORÇAMENTO (que por
--    regra da loja só pessoa faz), a IA responde "vou verificar e te
--    respondo em breve", DESLIGA a si mesma naquela conversa e cria um
--    alerta aqui pro portal. Também usada quando a IA detecta reclamação
--    ou qualquer coisa fora do escopo.
--
-- RLS: as duas são de uso exclusivo do portal — leitura e escrita só
-- pra `is_portal_admin()`. O webhook escreve via service_role, que
-- ignora RLS.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Chave liga/desliga por conversa ──
CREATE TABLE IF NOT EXISTS public.whatsapp_ai_state (
  wa_id       text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  -- Contador do dia, pra travar loop/rajada (zerado quando a data muda).
  replies_today int NOT NULL DEFAULT 0,
  replies_date  date,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_ai_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_ai_state_portal ON public.whatsapp_ai_state;
CREATE POLICY whatsapp_ai_state_portal ON public.whatsapp_ai_state
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- ── 2. Alertas do portal (pedido de preço/orçamento, escalonamento) ──
CREATE TABLE IF NOT EXISTS public.portal_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL,               -- 'preco' | 'orcamento' | 'humano'
  wa_id      text,                        -- conversa de origem
  lead_id    uuid,                        -- quando dá pra amarrar no lead
  title      text NOT NULL,
  body       text,
  resolved   boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_alerts_abertos
  ON public.portal_alerts (created_at DESC) WHERE resolved = false;

ALTER TABLE public.portal_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_alerts_portal ON public.portal_alerts;
CREATE POLICY portal_alerts_portal ON public.portal_alerts
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- ── 3. Padrão global da IA (opcional; ausente = 'off') ──
INSERT INTO public.app_settings (key, value)
VALUES ('whatsapp_ai_default', 'off')
ON CONFLICT (key) DO NOTHING;

-- ── Verificação ──
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='whatsapp_ai_state') AS tabela_chave,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='portal_alerts')     AS tabela_alertas,
  (SELECT value FROM public.app_settings WHERE key='whatsapp_ai_default') AS padrao_ia;
