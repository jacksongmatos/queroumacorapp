-- Leads: Perfil do IG + Estado (2026-09-08, pedido do usuário).
-- A planilha "Revista Click Rua — Diretório de Artistas" traz grafiteiros
-- com @ do Instagram e UF, quase sempre SEM telefone. O canal de contato
-- desses leads é o Instagram, não o WhatsApp.
--
-- Idempotente. O portal TOLERA as colunas ausentes (o importador refaz o
-- INSERT sem elas e avisa no relatório) — mas sem rodar isto o @ e a UF
-- não são gravados.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS state text;

-- Conferência (uma linha por coluna, `ok` true/false):
-- SELECT 'leads.instagram' AS item, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='instagram') AS ok
-- UNION ALL
-- SELECT 'leads.state', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='state');
