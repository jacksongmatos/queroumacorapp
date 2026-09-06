-- Revista Click Rua — edições no banco + páginas no bucket
-- ────────────────────────────────────────────────────────────────────────
-- Muda de decisão em relação ao que entrou no PR #228, e o motivo mudou
-- junto: lá, edição nova só chegava com um commit (o catálogo vivia em
-- `lib/clickRua.ts`), então arquivo estático bastava. Agora a loja sobe
-- edição pelo portal, sem deploy — e não existe onde gravar em runtime a
-- não ser em storage.
--
-- `paginas` guarda a URL de cada página, em ordem. Guardar URL (e não só o
-- path do bucket) é o que deixa a edição #01, que hoje é arquivo estático
-- em `/click-rua/ed01/`, conviver com as novas sem o app saber a diferença
-- — e é o que permite migrá-la pelo portal sem downtime.

CREATE TABLE IF NOT EXISTS public.click_rua_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Número impresso na capa. Único: não existem duas edições #03.
  numero int NOT NULL UNIQUE,
  -- Mês/ano como sai na capa, ex.: 'setembro de 2020'. Texto livre porque
  -- é rótulo editorial, não data de cálculo.
  quando text,
  -- Chamada de capa ("B.Girl LU BSB e sua trajetória").
  destaque text,
  -- 'pronta' aparece pra ler; 'em_breve' aparece como card cinza.
  status text NOT NULL DEFAULT 'em_breve' CHECK (status IN ('pronta', 'em_breve')),
  capa_url text,
  -- URLs das páginas, NA ORDEM DE LEITURA. É o array que o leitor percorre.
  paginas text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_click_rua_numero
  ON public.click_rua_editions (numero);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_click_rua_updated_at ON public.click_rua_editions;
CREATE TRIGGER trg_click_rua_updated_at
  BEFORE UPDATE ON public.click_rua_editions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: leitura liberada (a revista é conteúdo aberto do app; quem filtra
-- por papel é a tela, não o banco). Escrita só admin do portal.
ALTER TABLE public.click_rua_editions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS click_rua_select_all ON public.click_rua_editions;
CREATE POLICY click_rua_select_all
  ON public.click_rua_editions
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS click_rua_admin_write ON public.click_rua_editions;
CREATE POLICY click_rua_admin_write
  ON public.click_rua_editions
  FOR ALL
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- ── Bucket das páginas ─────────────────────────────────────────────────
-- Público na leitura: as páginas são servidas direto por URL no <img>, e
-- URL assinada aqui só criaria link que expira no meio da leitura.
-- 15 MB por arquivo cobre página grande antes da conversão pra WebP; o
-- portal converte no navegador, então o que chega aqui já vem pequeno.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'click-rua', 'click-rua', true, 15728640,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 15728640,
      allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

DROP POLICY IF EXISTS "click-rua public read" ON storage.objects;
CREATE POLICY "click-rua public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'click-rua');

DROP POLICY IF EXISTS "click-rua admin insert" ON storage.objects;
CREATE POLICY "click-rua admin insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'click-rua' AND public.is_portal_admin());

DROP POLICY IF EXISTS "click-rua admin update" ON storage.objects;
CREATE POLICY "click-rua admin update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'click-rua' AND public.is_portal_admin())
  WITH CHECK (bucket_id = 'click-rua' AND public.is_portal_admin());

DROP POLICY IF EXISTS "click-rua admin delete" ON storage.objects;
CREATE POLICY "click-rua admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'click-rua' AND public.is_portal_admin());

-- ── As 6 edições ───────────────────────────────────────────────────────
-- A #01 nasce apontando pros arquivos ESTÁTICOS que já estão publicados.
-- Assim o app não fica sem revista entre rodar este SQL e migrar as
-- páginas pro bucket — a migração é um botão no portal, e quando ela roda,
-- estas URLs são substituídas pelas do bucket.
INSERT INTO public.click_rua_editions (numero, quando, destaque, status, capa_url, paginas) VALUES
(1, 'setembro de 2020', 'B.Girl LU BSB e sua trajetória', 'pronta',
 '/click-rua/ed01-capa.webp',
 ARRAY['/click-rua/ed01/1.webp','/click-rua/ed01/2.webp','/click-rua/ed01/3.webp','/click-rua/ed01/4.webp','/click-rua/ed01/5.webp','/click-rua/ed01/6.webp','/click-rua/ed01/7.webp','/click-rua/ed01/8.webp']),
(2, NULL, NULL, 'em_breve', NULL, ARRAY[]::text[]),
(3, NULL, NULL, 'em_breve', NULL, ARRAY[]::text[]),
(4, NULL, NULL, 'em_breve', NULL, ARRAY[]::text[]),
(5, NULL, NULL, 'em_breve', NULL, ARRAY[]::text[]),
(6, NULL, NULL, 'em_breve', NULL, ARRAY[]::text[])
ON CONFLICT (numero) DO NOTHING;

-- ── Conferência (só leitura) ───────────────────────────────────────────
--   SELECT numero, status, quando, coalesce(array_length(paginas,1),0) AS paginas
--     FROM public.click_rua_editions ORDER BY numero;
-- Esperado: 6 linhas, a #01 'pronta' com 8 páginas, as outras 'em_breve'.
