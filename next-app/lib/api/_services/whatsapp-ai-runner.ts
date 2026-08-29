// lib/api/_services/whatsapp-ai-runner.ts — cola entre o webhook da
// Evolution e a IA. Roda quando chega mensagem de cliente e decide:
// responder sozinho, escalar pro humano, ou não fazer nada.
//
// Tudo aqui é BEST-EFFORT: qualquer falha volta silenciosa, porque o
// webhook precisa devolver 200 de qualquer jeito (senão a Evolution
// re-entrega em loop) e a mensagem do cliente já foi salva.
//
// Ordem das decisões (a primeira que bater, manda):
//   1. opt-out ("PARE")        → desliga a IA pra sempre nessa conversa
//   2. IA desligada            → não faz nada
//   3. fora do horário comercial → não faz nada (responde no dia seguinte)
//   4. teto diário estourado   → não faz nada (anti-loop)
//   5. gera resposta           → envia; se escalou, desliga a IA e alerta

import { getServiceKey, getSupabaseUrl } from '../security';
import {
  generateAiReply,
  isAiConfigured,
  isBusinessHour,
  isOptOut,
  MAX_AUTO_REPLIES_PER_DAY,
  parseHoursSetting,
  type ConversationTurn,
  type LeadContext,
} from './whatsapp-ai';
import { sendEvolutionText } from './whatsapp-evo';
import { persistWhatsAppMessage } from './whatsapp';

const DB_TIMEOUT_MS = 8000;

function rest(path: string): string {
  return `${getSupabaseUrl().replace(/\/$/, '')}/rest/v1/${path}`;
}
function headers(extra?: Record<string, string>): Record<string, string> {
  const k = getServiceKey() || '';
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}
async function dbGet<T>(path: string): Promise<T[]> {
  const r = await fetch(rest(path), {
    headers: headers(),
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  });
  if (!r.ok) return [];
  return (await r.json()) as T[];
}

interface AiState {
  wa_id: string;
  enabled: boolean;
  replies_today: number;
  replies_date: string | null;
}

/**
 * Grava a ÚLTIMA DECISÃO da IA na conversa. Sem isso, quando ela fica
 * quieta o operador não tem como saber se foi horário, teto diário,
 * chave desligada ou erro — e o silêncio vira caça ao fantasma (foi o
 * que aconteceu em 2026-08-29). O portal mostra esse texto embaixo da
 * chave. Best-effort: falhar aqui não pode atrapalhar o atendimento.
 */
async function registrarDecisao(waId: string, why: string): Promise<void> {
  await fetch(rest('whatsapp_ai_state?on_conflict=wa_id'), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ wa_id: waId, last_why: why.slice(0, 120), last_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  }).catch(() => {});
}

/** Resolve a chave da conversa: linha própria > padrão global > off. */
export async function isAiEnabledFor(waId: string): Promise<{ enabled: boolean; state: AiState | null }> {
  const rows = await dbGet<AiState>(
    `whatsapp_ai_state?wa_id=eq.${encodeURIComponent(waId)}&select=wa_id,enabled,replies_today,replies_date`,
  );
  if (rows.length > 0) return { enabled: !!rows[0].enabled, state: rows[0] };
  const cfg = await dbGet<{ value: string }>(
    `app_settings?key=eq.whatsapp_ai_default&select=value`,
  );
  return { enabled: (cfg[0]?.value || 'off') === 'on', state: null };
}

async function setAiEnabled(waId: string, enabled: boolean): Promise<void> {
  await fetch(rest('whatsapp_ai_state?on_conflict=wa_id'), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ wa_id: waId, enabled, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  }).catch(() => {});
}

async function bumpReplyCount(waId: string, state: AiState | null): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  const zerou = !state || state.replies_date !== hoje;
  await fetch(rest('whatsapp_ai_state?on_conflict=wa_id'), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({
      wa_id: waId,
      enabled: true,
      replies_today: zerou ? 1 : (state?.replies_today || 0) + 1,
      replies_date: hoje,
      updated_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  }).catch(() => {});
}

export async function createAlert(input: {
  kind: 'preco' | 'orcamento' | 'humano';
  waId: string;
  leadId?: string | null;
  title: string;
  body?: string;
}): Promise<void> {
  await fetch(rest('portal_alerts'), {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      kind: input.kind,
      wa_id: input.waId,
      lead_id: input.leadId || null,
      title: input.title,
      body: input.body || null,
    }),
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  }).catch(() => {});
}

/** Últimas trocas da conversa, em ordem cronológica. */
async function loadTurns(waId: string): Promise<ConversationTurn[]> {
  const rows = await dbGet<{ direction: string; body: string | null; created_at: string }>(
    `whatsapp_messages?wa_id=eq.${encodeURIComponent(waId)}&select=direction,body,created_at&order=created_at.desc&limit=10`,
  );
  return rows
    .reverse()
    .filter((r) => (r.body || '').trim())
    .map((r) => ({ direction: r.direction === 'out' ? 'out' : 'in', body: r.body || '' }));
}

/** Lead correspondente ao número (casamento pelos últimos 8 dígitos). */
async function loadLead(waId: string): Promise<{ id: string; ctx: LeadContext } | null> {
  const tail = waId.slice(-8);
  const rows = await dbGet<{
    id: string;
    name: string | null;
    phone: string | null;
    category: string | null;
    segment: string | null;
    city: string | null;
    neighborhood: string | null;
  }>(`leads?phone=ilike.*${encodeURIComponent(tail)}*&select=id,name,phone,category,segment,city,neighborhood&limit=1`);
  const l = rows[0];
  if (!l) return null;
  return {
    id: l.id,
    ctx: {
      name: l.name,
      category: l.category,
      segment: l.segment,
      city: l.city,
      neighborhood: l.neighborhood,
    },
  };
}

/**
 * Ponto de entrada chamado pelo webhook depois de gravar a mensagem
 * recebida. Nunca lança — devolve o que aconteceu, pra log.
 */
export async function maybeAutoReply(opts: {
  waId: string;
  text: string;
}): Promise<{ acted: boolean; why: string }> {
  const r = await decidirEAgir(opts);
  // Deixa rastro na conversa, seja qual for o desfecho.
  await registrarDecisao(opts.waId, (r.acted ? '✓ ' : '· ') + r.why);
  return r;
}

async function decidirEAgir(opts: {
  waId: string;
  text: string;
}): Promise<{ acted: boolean; why: string }> {
  try {
    if (!getSupabaseUrl() || !getServiceKey()) return { acted: false, why: 'sem service key' };

    // 1. Opt-out manda em tudo, inclusive fora do horário.
    if (isOptOut(opts.text)) {
      await setAiEnabled(opts.waId, false);
      await createAlert({
        kind: 'humano',
        waId: opts.waId,
        title: 'Cliente pediu PARE',
        body: 'A IA foi desligada nesta conversa. Não enviar mais mensagens para este número.',
      });
      return { acted: true, why: 'opt-out' };
    }

    const { enabled, state } = await isAiEnabledFor(opts.waId);
    if (!enabled) return { acted: false, why: 'IA desligada nesta conversa' };
    if (!isAiConfigured()) return { acted: false, why: 'OPENAI_API_KEY ausente' };

    // Janela de atendimento configurável no banco (app_settings
    // 'whatsapp_ai_hours'): "8-19" padrão, "0-24" pra atender sempre.
    const cfgHoras = await dbGet<{ value: string }>(
      `app_settings?key=eq.whatsapp_ai_hours&select=value`,
    );
    const janela = parseHoursSetting(cfgHoras[0]?.value);
    if (!isBusinessHour(new Date(), janela)) {
      return { acted: false, why: `fora do horário de atendimento (${janela.start}h-${janela.end}h BRT)` };
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const jaHoje = state && state.replies_date === hoje ? state.replies_today : 0;
    if (jaHoje >= MAX_AUTO_REPLIES_PER_DAY) {
      return { acted: false, why: 'teto diário de respostas atingido' };
    }

    const [turns, lead] = await Promise.all([loadTurns(opts.waId), loadLead(opts.waId)]);
    const result = await generateAiReply({ lead: lead?.ctx || null, turns });
    if (!result.reply) return { acted: false, why: 'IA não produziu resposta' };

    // Envia (a Evolution está acordada — ela acabou de nos chamar).
    const sent = await sendEvolutionText({ to: opts.waId, body: result.reply });
    await persistWhatsAppMessage({
      direction: 'out',
      waId: opts.waId,
      messageId: sent.messageId,
      type: 'text',
      body: result.reply,
    });
    await bumpReplyCount(opts.waId, state);

    if (result.escalate) {
      // Desliga a IA e chama gente — preço/orçamento/assunto delicado.
      await setAiEnabled(opts.waId, false);
      await createAlert({
        kind: result.reason || 'humano',
        waId: opts.waId,
        leadId: lead?.id || null,
        title:
          result.reason === 'preco'
            ? 'Cliente pediu PREÇO'
            : result.reason === 'orcamento'
              ? 'Cliente pediu ORÇAMENTO'
              : 'Conversa precisa de atendimento humano',
        body: (opts.text || '').slice(0, 300),
      });
      return { acted: true, why: 'respondeu e escalou (' + (result.reason || 'humano') + ')' };
    }

    return { acted: true, why: 'respondeu automaticamente' };
  } catch (e) {
    console.warn('whatsapp-ai-runner:', e instanceof Error ? e.message : e);
    return { acted: false, why: 'erro interno' };
  }
}
