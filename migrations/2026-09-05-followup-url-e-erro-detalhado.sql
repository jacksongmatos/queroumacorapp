-- 2026-09-05 — duas coisas, as duas de uma linha cada.
--
-- (A) CODIGO E TITULO DA FALHA separados. A Wave 58 ja guarda o motivo
--     montado em `delivery_error` ("131049 · Title · detalhe"), que serve
--     pra LER na tela. Estas duas colunas servem pra CONTAR: quantas
--     falhas 131049 (marketing nao entregue), quantas 131026 (numero sem
--     WhatsApp). Sem elas, responder isso exigiria parsear texto.

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_error_code int;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_error_title text;

-- (B) ENDERECO DA VARREDURA DE FOLLOW-UP.
--
--     ATENCAO: isto conserta um follow-up QUE ESTA PARADO, nao so um nome
--     feio. A rota antiga autentica o cron com `EVOLUTION_WEBHOOK_TOKEN`,
--     env REMOVIDA do Cloudflare quando a Evolution foi aposentada. Sem
--     ela o caminho do cron nunca autentica, a chamada cai na exigencia de
--     token de admin — que o cron nao tem — e volta 403 de hora em hora,
--     sem ninguem ver.
--
--     Troque <SEGREDO> pelo valor de WHATSAPP_WEBHOOK_URL_SECRET (o mesmo
--     do webhook, que esta no painel do Cloudflare como Secret).
--
--     A rota antiga continua no ar delegando pra nova, entao rodar isto
--     nao tem janela de indisponibilidade.

UPDATE app_settings
   SET value = 'https://www.queroumacor.com.br/api/whatsapp/followup?token=<SEGREDO>'
 WHERE key = 'whatsapp_followup_url';

-- Conferencia (deve devolver a URL nova):
-- SELECT key, value FROM app_settings WHERE key = 'whatsapp_followup_url';
