-- 2026-09-07-role-arquiteto.sql
-- Perfil novo: ARQUITETO / ENGENHEIRO.
--
-- Sem isto o cadastro do papel novo NÃO funciona, e falha de duas formas
-- diferentes (as duas silenciosas do ponto de vista de quem se cadastra):
--
--  1. `profiles_user_type_check` recusa o valor 'arquiteto' → o INSERT do
--     perfil estoura dentro da trigger, que engole a exceção com RAISE
--     WARNING: a conta de auth nasce e o PERFIL não. Mesmo modo de falha do
--     `leads.city` e do `quotes.post_id`.
--  2. A `handle_new_user` tem uma lista branca própria de papéis e rebaixa
--     o que não conhece pra 'cliente'. Ou seja: a pessoa escolhe Arquiteto e
--     vira Cliente, sem aviso nenhum.
--
-- 'engenheiro' é sinônimo de 'arquiteto' (mesmo papel, profissão diferente),
-- igual 'funileiro' é de 'automotivo'. O app normaliza em lib/roles.ts.
--
-- Idempotente. Rodar no Supabase SQL Editor.

-- 1) Constraint: aceita os papéis novos.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_type_check CHECK (user_type IS NULL OR user_type IN ('cliente','pintor','grafiteiro','automotivo','funileiro','arquiteto','engenheiro','admin'));

-- 2) Trigger de criação de conta: reconhece o papel novo e normaliza os
--    sinônimos em vez de rebaixar pra 'cliente'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_type text;
  v_birth date;
BEGIN
  v_user_type := LOWER(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'user_type'), ''), 'cliente'));

  -- Sinônimos viram o papel canônico ANTES da lista branca. Sem isto,
  -- 'funileiro' e 'engenheiro' cairiam em 'cliente'.
  IF v_user_type = 'funileiro' THEN v_user_type := 'automotivo'; END IF;
  IF v_user_type = 'engenheiro' THEN v_user_type := 'arquiteto'; END IF;
  IF v_user_type = 'graffiti' THEN v_user_type := 'grafiteiro'; END IF;

  IF v_user_type NOT IN ('cliente','pintor','grafiteiro','automotivo','arquiteto') THEN
    v_user_type := 'cliente';
  END IF;

  -- birth_date pode vir vazio/inválido — cast defensivo.
  BEGIN
    v_birth := NULLIF(TRIM(NEW.raw_user_meta_data->>'birth_date'), '')::date;
  EXCEPTION WHEN OTHERS THEN
    v_birth := NULL;
  END;

  BEGIN
    INSERT INTO public.profiles
      (id, name, user_type, role, tag, phone, city, state, birth_date, created_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      v_user_type, v_user_type,
      NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'tag')), ''),
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

-- ATENÇÃO (07/09/2026): ESTE ARQUIVO FICOU PELA METADE. A tabela tem DOIS
-- CHECKs de papel — `profiles_user_type_check` (corrigido aqui) e
-- `profiles_role_check` (esquecido). O segundo barrava `role='arquiteto'` e,
-- como a trigger engole a exceção, o cadastro de arquiteto nascia sem perfil.
-- O complemento está em `/migrations/2026-09-07-role-check-arquiteto.sql`.
--
-- 3) Conferência (só lê). `ok` true nas duas linhas = pode cadastrar.
--    NOTA: esta conferência pergunta por UM nome de constraint e por isso
--    voltou `true` enquanto o cadastro continuava quebrado. Preferir a
--    listagem completa do arquivo complementar.
SELECT 'constraint aceita arquiteto' AS item,
       EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname='profiles_user_type_check'
                  AND pg_get_constraintdef(oid) LIKE '%arquiteto%') AS ok
UNION ALL
SELECT 'handle_new_user conhece arquiteto',
       EXISTS (SELECT 1 FROM pg_proc
                WHERE proname='handle_new_user' AND prosrc LIKE '%arquiteto%');
