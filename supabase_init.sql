-- ============================================
-- QueroUmaCor - Supabase Database Setup
-- Execute this in Supabase SQL Editor
-- ============================================

-- Products table (used by Cali Colors portal)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text,
  category text DEFAULT 'tintas',
  volume text DEFAULT '18L',
  price numeric DEFAULT 0,
  color_hex text DEFAULT '#c0622d',
  color_gradient text,
  stock integer DEFAULT 0,
  badge text,
  description text,
  line text DEFAULT 'Linha Premium',
  rendimento text DEFAULT '~10m²/L',
  demaos text DEFAULT '2',
  secagem text DEFAULT '2h',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Allow public read access to products
CREATE POLICY "Products are viewable by everyone" ON public.products
  FOR SELECT USING (true);

-- Allow authenticated users to manage products (portal admin)
CREATE POLICY "Authenticated users can insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update products" ON public.products
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete products" ON public.products
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- Posts table (ensure insert policy exists)
-- ============================================
-- If posts table already exists, just ensure RLS policies allow inserts:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'posts' AND policyname = 'Users can insert own posts'
  ) THEN
    CREATE POLICY "Users can insert own posts" ON public.posts
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Ensure users can read posts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'posts' AND policyname = 'Posts are viewable by everyone'
  ) THEN
    CREATE POLICY "Posts are viewable by everyone" ON public.posts
      FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================
-- Profiles table - ensure read/write works
-- ============================================
-- Allow everyone to read profiles (needed for search, feed, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Profiles are viewable by everyone'
  ) THEN
    CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.profiles
      FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ============================================
-- Foreign key: posts.user_id -> profiles.id
-- (needed for Supabase embedded joins)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'posts_user_id_fkey' AND table_name = 'posts'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
  END IF;
END $$;

-- ============================================
-- Follows table (needed for feed filtering)
-- ============================================
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'follows' AND policyname = 'Follows are viewable by everyone'
  ) THEN
    CREATE POLICY "Follows are viewable by everyone" ON public.follows FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'follows' AND policyname = 'Users can manage own follows'
  ) THEN
    CREATE POLICY "Users can manage own follows" ON public.follows
      FOR ALL TO authenticated USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);
  END IF;
END $$;

-- ============================================
-- Likes table (needed for post likes)
-- ============================================
CREATE TABLE IF NOT EXISTS public.likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'likes' AND policyname = 'Likes are viewable by everyone'
  ) THEN
    CREATE POLICY "Likes are viewable by everyone" ON public.likes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'likes' AND policyname = 'Users can manage own likes'
  ) THEN
    CREATE POLICY "Users can manage own likes" ON public.likes
      FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- Storage: ensure 'posts' bucket exists
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('posts', 'posts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to posts bucket
CREATE POLICY "Users can upload to posts bucket" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'posts');

-- Allow public read from posts bucket
CREATE POLICY "Public read posts bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'posts');
