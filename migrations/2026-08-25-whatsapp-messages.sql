-- ============================================================================
-- SQL Wave 38 (2026-08-25) — tabela `whatsapp_messages`
--
-- Histórico das conversas do NÚMERO OFICIAL da Cali Colors
-- (+55 11 95976-5031) via WhatsApp Cloud API:
--   - direction='in'  → mensagem recebida (gravada pelo /api/whatsapp/webhook)
--   - direction='out' → mensagem enviada  (gravada pelo /api/whatsapp/send)
--
-- SEPARADA da tabela `messages` do chat interno (user↔user, FK em profiles):
-- aqui o interlocutor é um telefone externo, sem conta no app.
--
-- Segurança:
--   - RLS ON. SELECT só pra admin (is_portal_admin()) — conversa de cliente
--     não é pública.
--   - SEM policy de INSERT/UPDATE/DELETE: só o backend escreve via
--     service_role (bypassa RLS). Nenhum usuário grava direto.
--   - `message_id` (wamid da Meta) é UNIQUE: a Meta REENVIA webhooks quando
--     não recebe 200 rápido — o unique + upsert ignore-duplicates evita
--     linha dupla. NULL permitido (múltiplos) pra registro sem wamid.
-- ============================================================================

create table if not exists public.whatsapp_messages (
  id           uuid primary key default gen_random_uuid(),
  direction    text not null check (direction in ('in', 'out')),
  wa_id        text not null,             -- telefone E.164 sem '+' do outro lado
  profile_name text,                      -- nome de perfil do remetente (inbound)
  message_id   text unique,               -- wamid da Meta (dedupe de retry)
  type         text not null default 'text',
  body         text,                      -- texto da mensagem
  template     text,                      -- nome do template (outbound type=template)
  sent_by      uuid references public.profiles(id) on delete set null, -- admin que enviou
  wa_timestamp timestamptz,               -- timestamp reportado pela Meta (inbound)
  created_at   timestamptz not null default now()
);

-- Listagem geral (tela admin) e por conversa.
create index if not exists idx_whatsapp_messages_created
  on public.whatsapp_messages (created_at desc);
create index if not exists idx_whatsapp_messages_wa_id
  on public.whatsapp_messages (wa_id, created_at desc);

alter table public.whatsapp_messages enable row level security;

drop policy if exists "whatsapp_messages admin select" on public.whatsapp_messages;
create policy "whatsapp_messages admin select"
  on public.whatsapp_messages
  for select
  to authenticated
  using (is_portal_admin());

-- Sem policies de escrita de propósito: INSERT/UPDATE/DELETE só via
-- service_role (backend), que bypassa RLS.
