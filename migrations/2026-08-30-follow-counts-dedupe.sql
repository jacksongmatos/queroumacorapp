-- ════════════════════════════════════════════════════════════════════
-- Wave 54 (2026-08-30) — contador de seguidores contando EM DOBRO.
--
-- Sintoma: perfil mostra "6 seguidores" com 3 follows reais — exatamente
-- 2×, inclusive em conta criada DEPOIS da Wave 40 (ou seja, sem backfill
-- no meio: o número veio só de trigger). O código do app não escreve nos
-- contadores; logo há DOIS triggers vivos em `follows` somando juntos —
-- um legado com outro nome (a Wave 40 só derruba o homônimo dela,
-- `trg_maintain_follow_counts`).
--
-- Este SQL: (1) mostra os triggers vivos; (2) derruba todo trigger de
-- CONTADOR que não seja o canônico — o filtro exige que a função toque
-- followers_count/following_count/posts_count, então triggers de outra
-- função (pontos, notificação) passam intocados; (3) reconta os três
-- contadores a partir da verdade; (4) verificação: zero divergentes.
-- ════════════════════════════════════════════════════════════════════

-- ── 1) Diagnóstico: quem vive nas duas tabelas hoje ──
SELECT c.relname AS tabela, t.tgname, p.proname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
WHERE c.relname IN ('follows', 'posts') AND NOT t.tgisinternal
ORDER BY 1, 2;

-- ── 2) Derruba duplicatas de contador ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tabela, t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND (
        (c.relname = 'follows'
          AND t.tgname <> 'trg_maintain_follow_counts'
          AND (p.prosrc ILIKE '%followers_count%' OR p.prosrc ILIKE '%following_count%'))
        OR
        (c.relname = 'posts'
          AND t.tgname <> 'trg_maintain_posts_count'
          AND p.prosrc ILIKE '%posts_count%')
      )
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.%I', r.tgname, r.tabela);
    RAISE NOTICE 'trigger duplicado removido: %.%', r.tabela, r.tgname;
  END LOOP;
END $$;

-- ── 3) Recontagem a partir da verdade ──
UPDATE public.profiles p SET
  followers_count = (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id),
  following_count = (SELECT count(*) FROM public.follows f WHERE f.follower_id = p.id),
  posts_count     = (SELECT count(*) FROM public.posts po
                      WHERE po.user_id = p.id
                        AND po.deleted_at IS NULL
                        AND COALESCE(po.media_type, '') <> 'story');

-- ── 4) Verificação ──
SELECT
  (SELECT count(*) FROM public.profiles p
    WHERE p.followers_count <> (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id)
       OR p.following_count <> (SELECT count(*) FROM public.follows f WHERE f.follower_id = p.id))
    AS contadores_divergentes,
  (SELECT count(*) FROM public.follows f
    WHERE f.following_id = (SELECT id FROM public.profiles WHERE tag = 'valentimpintura'))
    AS seguidores_reais_do_bruno;
