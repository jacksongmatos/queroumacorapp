// adminWhatsApp — service da tela /admin/whatsapp (SQL Wave 38).
//
// Leitura: tabela `whatsapp_messages` direto pelo client Supabase — RLS só
// libera SELECT pra is_portal_admin(), então não-admin recebe lista vazia
// (e a página já tem guard server-side + gate cosmético).
//
// Envio: POST /api/whatsapp/send com o access token da sessão (a rota
// revalida admin server-side). O insert do histórico é feito pela própria
// rota via service_role — aqui não escrevemos na tabela.

import { getSupabase } from '@/lib/supabase';
import { NetworkError, ValidationError } from '@/lib/errors';

export type WhatsAppDirection = 'in' | 'out';

export interface WhatsAppMessageRow {
  id: string;
  direction: WhatsAppDirection;
  wa_id: string;
  profile_name: string | null;
  message_id: string | null;
  type: string;
  body: string | null;
  template: string | null;
  sent_by: string | null;
  wa_timestamp: string | null;
  created_at: string;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export async function fetchWhatsAppMessages(params: {
  direction?: WhatsAppDirection | 'all';
  limit?: number;
} = {}): Promise<WhatsAppMessageRow[]> {
  const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const direction = params.direction ?? 'all';

  const sb = getSupabase();
  let q = sb
    .from('whatsapp_messages')
    .select('id, direction, wa_id, profile_name, message_id, type, body, template, sent_by, wa_timestamp, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (direction !== 'all') q = q.eq('direction', direction);

  const { data, error } = await q;
  if (error) {
    throw new NetworkError(error.message || 'Falha ao carregar mensagens do WhatsApp', error);
  }
  return (data ?? []) as unknown as WhatsAppMessageRow[];
}

export interface SendWhatsAppResult {
  ok: boolean;
  messageId?: string;
  waId?: string;
  error?: string;
}

/**
 * Envia texto livre pelo número oficial via /api/whatsapp/send. A rota é
 * admin-only e devolve 422 quando o destinatário está fora da janela de
 * 24h da Meta (aí só template aprovado entrega).
 */
export async function sendWhatsAppFromAdmin(opts: {
  to: string;
  body: string;
}): Promise<SendWhatsAppResult> {
  const to = (opts.to || '').trim();
  const body = (opts.body || '').trim();
  if (!to) throw new ValidationError('Informe o número de destino');
  if (!body) throw new ValidationError('Escreva a mensagem');

  const sb = getSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new ValidationError('Sessão expirada — faça login de novo');

  let res: Response;
  try {
    res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, body }),
    });
  } catch (e) {
    throw new NetworkError('Falha de rede ao enviar', e);
  }

  let json: SendWhatsAppResult & { error?: string } = { ok: false };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* resposta sem JSON cai no throw abaixo */
  }
  if (!res.ok || !json.ok) {
    throw new NetworkError(json.error || `Envio falhou (HTTP ${res.status})`, json);
  }
  return json;
}
