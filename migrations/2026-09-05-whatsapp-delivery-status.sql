-- Wave 58 (2026-09-05) — status de entrega das mensagens do WhatsApp.
--
-- POR QUE: o portal registrava que a loja mandou e NUNCA sabia se chegou.
-- Quando um template de abordagem nao aparecia no celular do cliente, nao
-- havia como distinguir "numero sem WhatsApp" de "a pessoa recusou
-- marketing" de "limite da Meta" — so restava adivinhar.
--
-- A Meta manda esses avisos no MESMO webhook das mensagens (field
-- 'messages', com `statuses` no lugar de `messages`). O codigo ja os
-- recebia e descartava; agora eles tem onde pousar.
--
-- delivery_status: 'sent' | 'delivered' | 'read' | 'failed'
-- delivery_error : so em 'failed' — codigo + titulo + detalhe da Meta.
--
-- Seguro rodar mais de uma vez (IF NOT EXISTS). Nao mexe em linha
-- existente: mensagem antiga fica sem status, que e a verdade (o aviso
-- dela ja passou).

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_status_at timestamptz;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_error text;
