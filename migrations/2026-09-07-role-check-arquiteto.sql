-- 2026-09-07-role-check-arquiteto.sql
-- Complemento do 2026-09-07-role-arquiteto.sql, que ficou PELA METADE.
--
-- `public.profiles` tem DOIS CHECKs de papel, não um:
--   profiles_user_type_check  → corrigido na migration do arquiteto
--   profiles_role_check       → PASSOU BATIDO
--
-- A trigger grava o mesmo valor nas duas colunas, então `role='arquiteto'`
-- estourava 23514 e — como a `handle_new_user` engole a exceção com
-- RAISE WARNING — o cadastro de arquiteto nascia SEM PERFIL, calado.
--
-- LIÇÃO: a conferência que eu tinha escrito perguntava por UM nome de
-- constraint conhecido e voltou `true`, dando confiança falsa. Conferência
-- por nome só vale pros nomes que você já conhece. O passo 3 aqui LISTA
-- todas as constraints da tabela — é o que teria mostrado a segunda mina.
--
-- Idempotente. Rodar no Supabase SQL Editor.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IS NULL OR role IN ('cliente','pintor','grafiteiro','automotivo','funileiro','arquiteto','engenheiro','admin'));

-- Conferência: LISTA tudo, em vez de perguntar por nome.
SELECT conname, pg_get_constraintdef(oid) AS regra
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
ORDER BY conname;
