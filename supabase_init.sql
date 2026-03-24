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

-- Storage: ensure 'avatars' bucket exists
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to avatars bucket
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload avatars') THEN
  CREATE POLICY "Users can upload avatars" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
END IF;
END $$;

-- Allow public read from avatars bucket
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read avatars') THEN
  CREATE POLICY "Public read avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');
END IF;
END $$;

-- Allow users to update/overwrite their own avatars
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can update own avatars') THEN
  CREATE POLICY "Users can update own avatars" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
END IF;
END $$;

-- ============================================
-- Announcements table (avisos do portal)
-- ============================================
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  message text NOT NULL,
  active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Announcements viewable by everyone" ON public.announcements
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage announcements" ON public.announcements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- Orders table (pedidos da loja)
-- ============================================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  items jsonb DEFAULT '[]'::jsonb,
  total numeric DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view all orders" ON public.orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update orders" ON public.orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- Messages table (ensure conversation_id and receiver_id exist)
-- ============================================
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id text,
  content text,
  type text DEFAULT 'text',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Messages viewable by participants'
  ) THEN
    CREATE POLICY "Messages viewable by participants" ON public.messages
      FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Users can send messages'
  ) THEN
    CREATE POLICY "Users can send messages" ON public.messages
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
  END IF;
END $$;

-- Enable Realtime for messages table (required for postgres_changes subscription)
-- REPLICA IDENTITY FULL is REQUIRED for Realtime + RLS to work together
-- Without it, Supabase cannot evaluate RLS policies on realtime events
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Index for faster conversation queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);

-- ============================================
-- Reviews table (ensure it exists)
-- ============================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_id uuid,
  rating integer,
  criteria jsonb DEFAULT '[]'::jsonb,
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews viewable by everyone" ON public.reviews
  FOR SELECT USING (true);

CREATE POLICY "Users can create reviews" ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);
