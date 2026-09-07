-- 2026-09-07-username-not-null.sql
-- CAUSA RAIZ do "cadastro em duas etapas" / "loop no /completar-perfil".
--
-- Sintoma: a pessoa termina o cadastro, cai no /completar-perfil, preenche
-- tudo, clica em Concluir — e a tela volta. Para sempre.
--
-- Causa, provada no SQL Editor em 07/09/2026 (duas vezes, uma delas COM a
-- @tag preenchida):
--
--   ERROR 23502: null value in column "username" of relation "profiles"
--   violates not-null constraint
--
-- `profiles.username` é NOT NULL no banco, a `handle_new_user` grava `tag` e
-- NÃO grava `username`, e o gatilho que deveria espelhar tag→username não
-- roda no INSERT. Resultado: o INSERT do perfil estoura, a
-- `handle_new_user` ENGOLE a exceção com RAISE WARNING, a conta de auth
-- nasce e o perfil não.
--
-- E aí o segundo silêncio: `update` que não acha linha, no Supabase, é
-- SUCESSO com zero linhas. O app "salvava" o formulário, nada era gravado, e
-- a tela voltava — sem um único erro em lugar nenhum.
--
-- POR QUE SOLTAR O NOT NULL EM VEZ DE INVENTAR UM USERNAME: `username` é
-- sinônimo de `tag`, e o app trata os dois como a mesma coisa
-- (`isProfileComplete` aceita qualquer um). Preencher automático faria o
-- perfil de quem entra por Google/Apple PARECER completo sem ter @tag — e
-- essas pessoas nunca mais veriam a tela que pede a @tag: sumiriam da busca
-- e ficariam sem link de perfil, caladas. Trocar um bug barulhento por um
-- silencioso é o pior negócio possível aqui.
--
-- Idempotente. Rodar no Supabase SQL Editor, na ordem.

-- 1) A coluna deixa de ser obrigatória.
ALTER TABLE public.profiles ALTER COLUMN username DROP NOT NULL;

-- 2) A trigger passa a gravar os DOIS (espelho consistente desde o nascimento).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_type text;
  v_birth date;
  v_tag text;
BEGIN
  v_user_type := LOWER(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''), 'cliente'));
  IF v_user_type = 'funileiro' THEN v_user_type := 'automotivo'; END IF;
  IF v_user_type = 'engenheiro' THEN v_user_type := 'arquiteto'; END IF;
  IF v_user_type = 'graffiti' THEN v_user_type := 'grafiteiro'; END IF;
  IF v_user_type NOT IN ('cliente','pintor','grafiteiro','automotivo','arquiteto') THEN
    v_user_type := 'cliente';
  END IF;

  v_tag := NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'tag')), '');

  BEGIN
    v_birth := NULLIF(TRIM(NEW.raw_user_meta_data->>'birth_date'), '')::date;
  EXCEPTION WHEN OTHERS THEN
    v_birth := NULL;
  END;

  BEGIN
    INSERT INTO public.profiles
      (id, name, user_type, role, tag, username, phone, city, state, birth_date, created_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      v_user_type, v_user_type,
      v_tag, v_tag,
      NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'city'), ''),
      NULLIF(TRIM(UPPER(NEW.raw_user_meta_data->>'state')), ''),
      v_birth,
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user falhou para %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

-- 3) Backfill das contas que ficaram órfãs enquanto o bug esteve vivo.
--    Sem @tag de propósito: a UNIQUE recusaria duplicata e abortaria o lote.
--    O passo 4 devolve a @tag de quem tem uma livre.
INSERT INTO public.profiles (id, name, user_type, role, phone, city, state, created_at)
SELECT u.id,
       COALESCE(NULLIF(TRIM(u.raw_user_meta_data->>'name'),''), split_part(u.email,'@',1)),
       v.papel, v.papel,
       NULLIF(TRIM(u.raw_user_meta_data->>'phone'),''),
       NULLIF(TRIM(u.raw_user_meta_data->>'city'),''),
       NULLIF(TRIM(UPPER(u.raw_user_meta_data->>'state')),''),
       now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
CROSS JOIN LATERAL (SELECT CASE lower(coalesce(nullif(trim(u.raw_user_meta_data->>'user_type'),''),'cliente'))
         WHEN 'funileiro' THEN 'automotivo' WHEN 'engenheiro' THEN 'arquiteto' WHEN 'graffiti' THEN 'grafiteiro'
         WHEN 'pintor' THEN 'pintor' WHEN 'grafiteiro' THEN 'grafiteiro' WHEN 'automotivo' THEN 'automotivo'
         WHEN 'arquiteto' THEN 'arquiteto' ELSE 'cliente' END AS papel) v
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4) Devolve a @tag escolhida no cadastro, quando ninguém tomou.
UPDATE public.profiles p SET tag = m.tag, username = m.tag
FROM (SELECT u.id, NULLIF(LOWER(TRIM(u.raw_user_meta_data->>'tag')),'') AS tag FROM auth.users u) m
WHERE p.id = m.id AND p.tag IS NULL AND m.tag IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.tag = m.tag);

-- 5) Conferência (só lê). `contas_sem_perfil` tem que ser 0.
SELECT 'username aceita nulo' AS item,
       (SELECT is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='profiles' AND column_name='username') = 'YES' AS ok
UNION ALL
SELECT 'trigger grava username',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname='handle_new_user' AND prosrc LIKE '%username%')
UNION ALL
SELECT 'nenhuma conta sem perfil',
       (SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE p.id IS NULL) = 0;
