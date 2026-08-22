-- SQL Wave 37 (2026-08-22) — biblioteca de logos de marca (`brand_logos`)
-- ──────────────────────────────────────────────────────────────────────────
-- Motivação: os logos que o pintor gera no app (tela Camisetas → "Gerar Logo
-- com Seu Zé") e os que ele envia ("Já tenho meu logo") só existiam em dois
-- lugares frágeis:
--   1. no state da tela (some ao fechar o app);
--   2. em `profiles.business_logo_url`, que guarda UM só — o último salvo.
-- Pior: o gpt-image-1 devolve a imagem em base64, então a URL "salva" no
-- perfil era uma data URL gigante (~1.5MB de texto) dentro de uma coluna
-- text — e as variantes não escolhidas se perdiam.
--
-- Esta tabela é o histórico: toda imagem gerada/enviada vira uma linha com o
-- dono (pintor), a URL pública já no Storage, o prompt usado e se virou o
-- logo oficial do perfil. É o que a tela "Camisetas Personalizadas" do
-- /portal lê pra a loja saber QUEM pediu O QUÊ na hora de estampar.
--
-- Storage: os arquivos vão pro bucket `posts` (já público pra leitura), em
-- `<userId>/logos/<uuid>.png` — mesmo prefixo de userId que as policies de
-- storage exigem (Wave 27).

-- ============================================
-- 1. Tabela
-- ============================================
CREATE TABLE IF NOT EXISTS public.brand_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- URL pública no Storage. Nunca data URL: o servidor materializa o base64
  -- do gpt-image-1 em arquivo antes de gravar aqui.
  image_url text NOT NULL,
  -- Caminho no bucket (`<userId>/logos/<uuid>.png`), pra apagar/reprocessar
  -- sem ter que parsear a URL. NULL em linhas legadas.
  storage_path text,
  -- 'ai' = gerado pelo Seu Zé; 'upload' = o pintor mandou o logo dele.
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'upload')),
  -- Texto e estilo que o pintor digitou (só em source='ai'). A loja usa isso
  -- pra entender a intenção da marca quando for estampar.
  prompt_name text,
  prompt_style text,
  -- true quando essa imagem JÁ foi o `profiles.business_logo_url` do dono.
  -- Não é exclusivo (o pintor pode ter usado 2 logos ao longo do tempo); pra
  -- saber qual é o ATUAL, o /portal compara com `profiles.business_logo_url`.
  applied_to_profile boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.brand_logos IS
  'Histórico de logos gerados por IA / enviados pelo pintor. Lido pelo /portal (Camisetas) pra produção das camisetas.';

CREATE INDEX IF NOT EXISTS idx_brand_logos_user_created
  ON public.brand_logos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brand_logos_created
  ON public.brand_logos (created_at DESC);

-- Idempotência: o mesmo arquivo não vira 2 linhas (o insert do cliente pode
-- repetir em retry de rede). md5 porque image_url é text sem limite.
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_logos_user_url_uniq
  ON public.brand_logos (user_id, md5(image_url));

-- ============================================
-- 2. RLS
-- ============================================
ALTER TABLE public.brand_logos ENABLE ROW LEVEL SECURITY;

-- Dono lê/escreve o que é dele. Sem policy de UPDATE de user_id: o WITH CHECK
-- do UPDATE segura a linha no mesmo dono.
DROP POLICY IF EXISTS "brand_logos_select_own" ON public.brand_logos;
CREATE POLICY "brand_logos_select_own" ON public.brand_logos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "brand_logos_insert_own" ON public.brand_logos;
CREATE POLICY "brand_logos_insert_own" ON public.brand_logos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "brand_logos_update_own" ON public.brand_logos;
CREATE POLICY "brand_logos_update_own" ON public.brand_logos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "brand_logos_delete_own" ON public.brand_logos;
CREATE POLICY "brand_logos_delete_own" ON public.brand_logos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admin do portal enxerga TUDO (é o ponto da feature: a loja precisa ver o
-- logo de cada pintor pra estampar). Sem UPDATE/DELETE — a tela é read-only.
DROP POLICY IF EXISTS "brand_logos_select_admin" ON public.brand_logos;
CREATE POLICY "brand_logos_select_admin" ON public.brand_logos
  FOR SELECT TO authenticated
  USING (public.is_portal_admin());

-- ============================================
-- 3. cleanup_orphan_media() não pode comer os logos
-- ============================================
-- A função da Wave 5 considera órfão TODO arquivo do bucket `posts` que
-- nenhum post referencia — o que inclui os logos (que moram no mesmo
-- bucket, em `<userId>/logos/`). Hoje só o scan roda no cron (Wave 28), mas
-- se alguém chamasse `execute_cleanup_orphan_media()` os logos iriam junto.
-- Recria excluindo o que `brand_logos` e `profiles.business_logo_url`
-- referenciam.
CREATE OR REPLACE FUNCTION public.cleanup_orphan_media()
RETURNS TABLE(bucket_id text, name text) LANGUAGE sql AS $$
  SELECT s.bucket_id, s.name
  FROM storage.objects s
  LEFT JOIN public.posts p ON (
    s.bucket_id = 'posts' AND p.media_url LIKE '%' || s.name
  )
  WHERE s.bucket_id = 'posts'
    AND p.id IS NULL
    AND s.created_at < now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.brand_logos bl
      WHERE bl.storage_path = s.name OR bl.image_url LIKE '%' || s.name || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.business_logo_url LIKE '%' || s.name || '%'
    );
$$;

-- ============================================
-- 4. Backfill: o logo que já está no perfil vira a 1ª linha do histórico
-- ============================================
-- Só o que já é URL de arquivo (data URL gigante de geração antiga fica de
-- fora — não dá pra a loja usar e inflaria a tabela).
INSERT INTO public.brand_logos (user_id, image_url, source, applied_to_profile, created_at)
SELECT p.id, p.business_logo_url, 'upload', true, COALESCE(p.created_at, now())
FROM public.profiles p
WHERE p.business_logo_url IS NOT NULL
  AND p.business_logo_url <> ''
  AND p.business_logo_url NOT LIKE 'data:%'
ON CONFLICT DO NOTHING;
