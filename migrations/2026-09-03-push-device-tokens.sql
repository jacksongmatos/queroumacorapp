-- 2026-09-03 — SQL Wave 39: tokens de push NATIVO (FCM/APNs).
--
-- Canal SEPARADO do web push (`push_subscriptions`/VAPID): o app empacotado
-- roda em WebView, que não tem Web Push nenhum — lá o push vem do plugin
-- Capacitor (@capacitor/push-notifications), que devolve um token FCM
-- (Android) / APNs (iOS). O client grava o token aqui (RLS user-owned,
-- mesmo padrão do push_subscriptions); o ENVIO server-side (FCM HTTP v1)
-- é etapa futura e lerá via service_role.
--
-- Idempotente: pode rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE(token): re-registro do mesmo aparelho vira upsert (atualiza dono e
-- last_seen_at) — cobre também aparelho que trocou de conta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_device_tokens_token
  ON public.push_device_tokens (token);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user
  ON public.push_device_tokens (user_id, last_seen_at DESC);

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

-- RLS user-owned (espelha push_subscriptions): o usuário gerencia só as
-- próprias linhas. service_role (envio futuro) bypassa RLS por definição.
DROP POLICY IF EXISTS "push_device_tokens owner select" ON public.push_device_tokens;
CREATE POLICY "push_device_tokens owner select" ON public.push_device_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_device_tokens owner insert" ON public.push_device_tokens;
CREATE POLICY "push_device_tokens owner insert" ON public.push_device_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- UPDATE cobre o caminho do upsert por conflito de token: o aparelho que
-- trocou de conta atualiza a linha existente pro novo dono (WITH CHECK
-- garante que o novo dono é quem está logado).
DROP POLICY IF EXISTS "push_device_tokens owner update" ON public.push_device_tokens;
CREATE POLICY "push_device_tokens owner update" ON public.push_device_tokens
  FOR UPDATE TO authenticated USING (true) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_device_tokens owner delete" ON public.push_device_tokens;
CREATE POLICY "push_device_tokens owner delete" ON public.push_device_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Conferência:
SELECT policyname FROM pg_policies WHERE tablename = 'push_device_tokens';
