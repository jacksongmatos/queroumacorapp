-- leads.opted_out_at — o lead pediu pra não receber mais abordagem
-- ────────────────────────────────────────────────────────────────────────
-- Quem toca em "Não tenho interesse" no template já sai da IA e do
-- follow-up (whatsapp_ai_state.opted_out). O que faltava era o LADO DA
-- LISTA: sem esta coluna, o botão "Abordar" continuaria oferecendo o
-- contato, e o operador dispararia de novo pra quem acabou de dizer não.
--
-- Coluna nova em vez de um status: 'perdido' quer dizer "não fechou", que
-- é outra coisa — e sobrescrever o status apagaria a informação de funil
-- de um lead que talvez já estivesse qualificado.
--
-- Uma linha, statement único: colagem grande pelo celular corta o bloco.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

-- Conferência (só leitura):
--   SELECT count(*) FILTER (WHERE opted_out_at IS NOT NULL) AS fora,
--          count(*) AS total FROM public.leads;
