-- ============================================================================
-- SQL Wave 40 (2026-08-28) — contadores do perfil: backfill + triggers
--
-- Bug: o cabeçalho do perfil lê followers_count / following_count /
-- posts_count direto de `profiles` (a migration 2026-06-14 assumia
-- "mantidas por triggers"), mas NENHUM trigger que as mantenha existe no
-- repo — os números dessincronizam da tabela `follows` real (perfil
-- mostrando "0 seguindo" com dezenas de follows de verdade).
--
-- Este SQL: (1) garante as colunas; (2) cria os triggers de manutenção
-- (SECURITY DEFINER — sem isso, o UPDATE no profile DO OUTRO usuário
-- morre na RLS, que só permite editar a própria linha; provável razão de
-- uma versão antiga ter falhado silenciosamente); (3) RECALCULA tudo a
-- partir da verdade (follows + posts). Falha no contador nunca aborta o
-- follow/post original (EXCEPTION WHEN OTHERS, padrão das Waves 36/39).
-- ============================================================================

-- ── 1) Colunas (idempotente) ────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posts_count integer DEFAULT 0;

-- ── 2) Triggers de manutenção ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maintain_follow_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
       SET following_count = COALESCE(following_count, 0) + 1
     WHERE id = NEW.follower_id;
    UPDATE public.profiles
       SET followers_count = COALESCE(followers_count, 0) + 1
     WHERE id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
       SET following_count = GREATEST(0, COALESCE(following_count, 0) - 1)
     WHERE id = OLD.follower_id;
    UPDATE public.profiles
       SET followers_count = GREATEST(0, COALESCE(followers_count, 0) - 1)
     WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Contador é derivado: falhar aqui nunca pode custar o follow/unfollow.
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_follow_counts ON public.follows;
CREATE TRIGGER trg_maintain_follow_counts
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.maintain_follow_counts();

-- posts_count: conta posts vivos que não são story (mesma régua do
-- portfólio do perfil). Cobre INSERT, DELETE e o soft delete (UPDATE de
-- deleted_at, Wave 8).
CREATE OR REPLACE FUNCTION public.maintain_posts_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta integer := 0;
  v_user uuid;
  v_counts_old boolean;
  v_counts_new boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_user := NEW.user_id;
    v_delta := CASE WHEN COALESCE(NEW.media_type, '') <> 'story'
                     AND NEW.deleted_at IS NULL THEN 1 ELSE 0 END;
  ELSIF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id;
    v_delta := CASE WHEN COALESCE(OLD.media_type, '') <> 'story'
                     AND OLD.deleted_at IS NULL THEN -1 ELSE 0 END;
  ELSE -- UPDATE (soft delete / undo)
    v_user := NEW.user_id;
    v_counts_old := COALESCE(OLD.media_type, '') <> 'story' AND OLD.deleted_at IS NULL;
    v_counts_new := COALESCE(NEW.media_type, '') <> 'story' AND NEW.deleted_at IS NULL;
    v_delta := (CASE WHEN v_counts_new THEN 1 ELSE 0 END)
             - (CASE WHEN v_counts_old THEN 1 ELSE 0 END);
  END IF;

  IF v_delta <> 0 AND v_user IS NOT NULL THEN
    UPDATE public.profiles
       SET posts_count = GREATEST(0, COALESCE(posts_count, 0) + v_delta)
     WHERE id = v_user;
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_posts_count ON public.posts;
CREATE TRIGGER trg_maintain_posts_count
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.maintain_posts_count();

-- ── 3) BACKFILL: recalcula tudo a partir da verdade ─────────────────────────
UPDATE public.profiles p
   SET followers_count = COALESCE(f.c, 0)
  FROM (SELECT following_id, COUNT(*) c FROM public.follows GROUP BY following_id) f
 WHERE f.following_id = p.id;
UPDATE public.profiles
   SET followers_count = 0
 WHERE id NOT IN (SELECT DISTINCT following_id FROM public.follows WHERE following_id IS NOT NULL);

UPDATE public.profiles p
   SET following_count = COALESCE(f.c, 0)
  FROM (SELECT follower_id, COUNT(*) c FROM public.follows GROUP BY follower_id) f
 WHERE f.follower_id = p.id;
UPDATE public.profiles
   SET following_count = 0
 WHERE id NOT IN (SELECT DISTINCT follower_id FROM public.follows WHERE follower_id IS NOT NULL);

UPDATE public.profiles p
   SET posts_count = COALESCE(q.c, 0)
  FROM (
    SELECT user_id, COUNT(*) c
      FROM public.posts
     WHERE deleted_at IS NULL AND COALESCE(media_type, '') <> 'story'
     GROUP BY user_id
  ) q
 WHERE q.user_id = p.id;
UPDATE public.profiles
   SET posts_count = 0
 WHERE id NOT IN (
   SELECT DISTINCT user_id FROM public.posts
    WHERE deleted_at IS NULL AND COALESCE(media_type, '') <> 'story'
      AND user_id IS NOT NULL
 );

-- Conferência rápida (opcional): perfis com contador ≠ realidade → deve
-- retornar 0 linhas depois deste SQL.
-- SELECT p.id, p.following_count,
--        (SELECT COUNT(*) FROM follows f WHERE f.follower_id = p.id) AS real
--   FROM profiles p
--  WHERE p.following_count IS DISTINCT FROM
--        (SELECT COUNT(*) FROM follows f WHERE f.follower_id = p.id);
