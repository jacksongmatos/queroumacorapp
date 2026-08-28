-- ============================================================================
-- SQL Wave 41 (2026-08-28) — bucket `exports` pra download de PDF no app
--
-- No WebView do wrapper Android NENHUM download local funciona: share de
-- arquivo não existe, blob: o lado nativo não lê ("Save As" vazio) e
-- data: o DownloadManager recusa (só http/https). O app agora sobe o PDF
-- gerado (orçamento, lista de pedido) pra este bucket e entrega o LINK
-- público com ?download= — o Android baixa como um download comum.
--
-- Regras: leitura pública (o link vai pro cliente via WhatsApp mesmo);
-- escrita/edição/exclusão só do dono, no próprio path `<userId>/...`
-- (mesmo padrão dos buckets posts/avatars — Wave 27).
--
-- Se o INSERT em storage.buckets falhar no seu projeto (aconteceu com o
-- art-refs), crie o bucket pela UI (Storage → New bucket) com:
--   nome: exports · Public: ON · limite: 10MB · mime: application/pdf
-- e rode SÓ o bloco de policies abaixo.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exports', 'exports', true, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ── Policies em storage.objects ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'exports owner insert'
  ) THEN
    CREATE POLICY "exports owner insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'exports'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'exports owner update'
  ) THEN
    CREATE POLICY "exports owner update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'exports'
        AND split_part(name, '/', 1) = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'exports'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'exports owner delete'
  ) THEN
    CREATE POLICY "exports owner delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'exports'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END $$;
