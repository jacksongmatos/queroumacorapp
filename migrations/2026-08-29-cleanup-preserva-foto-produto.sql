-- ════════════════════════════════════════════════════════════════════
-- Wave 50 (2026-08-29) — a limpeza de mídia órfã não pode comer a FOTO
-- DE PRODUTO.
--
-- `cleanup_orphan_media()` considera órfão todo arquivo do bucket `posts`
-- que nenhum post referencia. Ela já foi ensinada a poupar os logos
-- (Wave 37); faltava a foto de produto, que passa a existir agora que o
-- upload do portal voltou a funcionar. Sem esta correção, a foto que o
-- operador sobe hoje entraria na lista de órfãos em 7 dias.
--
-- Vale lembrar: o cron semanal roda a versão que só LISTA. Quem apaga é
-- `execute_cleanup_orphan_media()`, chamada na mão por admin. Ou seja,
-- isto é uma mina desarmada, não um incêndio — mas é uma mina.
-- ════════════════════════════════════════════════════════════════════

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
    )
    -- NOVO: foto de produto da loja (portal → Produtos/Tintas).
    AND NOT EXISTS (
      SELECT 1 FROM public.products pd
      WHERE pd.image_url LIKE '%' || s.name || '%'
    );
$$;

-- ── Verificação: nenhuma foto de produto pode aparecer na lista ──
SELECT count(*) AS fotos_de_produto_marcadas_como_orfas
  FROM public.cleanup_orphan_media() c
  JOIN public.products pd ON pd.image_url LIKE '%' || c.name || '%';
