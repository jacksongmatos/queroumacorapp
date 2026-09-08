-- Prompt da IA editavel no portal (2026-09-08).
-- NULL = padrao do codigo (PROMPT_BASE_PADRAO em lib/api/_services/whatsapp-ai.ts).
-- O codigo TOLERA a coluna ausente (runner refaz o select sem ela; o portal
-- mostra este SQL ao tentar salvar), entao pode rodar quando quiser.
ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS prompt text;
