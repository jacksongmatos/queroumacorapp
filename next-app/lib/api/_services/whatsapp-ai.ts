// lib/api/_services/whatsapp-ai.ts — atendimento automático do WhatsApp do
// portal (Evolution) com ChatGPT.
//
// REGRA DE NEGÓCIO INEGOCIÁVEL (decisão do dono, 2026-08-29):
// a IA NUNCA fala preço, valor, desconto, condição de pagamento nem faz
// orçamento. Isso é trabalho de pessoa. Quando o cliente pede, a IA diz
// que vai verificar e responder em breve, DESLIGA a si mesma naquela
// conversa e cria um alerta no portal.
//
// A regra é aplicada em DOIS lugares, de propósito:
//   1. no prompt (a IA é instruída a não falar);
//   2. numa TRAVA DE CÓDIGO que varre a resposta antes de enviar.
// Prompt pode falhar — modelo alucina, cliente insiste, alguém edita o
// texto. A trava não depende de o modelo obedecer.
//
// Modelo configurável por env (`WHATSAPP_AI_MODEL`, default gpt-4o-mini,
// o mesmo que o resto do app usa) pra trocar sem deploy.

import { getRuntimeEnv } from '../env';
import { ServiceError } from '../security';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const AI_TIMEOUT_MS = 20000;
export const DEFAULT_AI_MODEL = 'gpt-4o-mini';

/** Horário comercial de Brasília — a IA não responde fora dele. */
export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 19; // responde até 18:59

/** Teto de respostas automáticas por conversa por dia (anti-loop). */
export const MAX_AUTO_REPLIES_PER_DAY = 12;

export interface LeadContext {
  name?: string | null;
  category?: string | null;
  segment?: string | null;
  city?: string | null;
  neighborhood?: string | null;
}

export interface ConversationTurn {
  direction: 'in' | 'out';
  body: string;
}

export interface AiReplyResult {
  /** Texto pronto pra enviar. Vazio quando não há o que responder. */
  reply: string;
  /** true = precisa de humano; NÃO enviar `reply` como resposta final. */
  escalate: boolean;
  /** 'preco' | 'orcamento' | 'humano' — usado no alerta do portal. */
  reason: 'preco' | 'orcamento' | 'humano' | null;
}

// ─── Travas de segurança (puras, testáveis) ─────────────────────────────────

/**
 * O CLIENTE está pedindo preço/orçamento? Roda na mensagem recebida —
 * se der positivo, nem chamamos a IA: escala direto.
 */
export function clientAsksForPrice(text: string): 'preco' | 'orcamento' | null {
  const t = (text || '').toLowerCase();
  if (/or[çc]ament|fazer um or[çc]|me or[çc]a/.test(t)) return 'orcamento';
  if (
    /(pre[çc]o|valor|quanto custa|quanto (?:fica|sai|é|e)\b|tabela de pre|cota[çc]|desconto|parcel|forma de pagamento|à vista|a vista)/.test(
      t,
    )
  ) {
    return 'preco';
  }
  return null;
}

/**
 * A RESPOSTA DA IA vazou preço? Última linha de defesa antes de enviar.
 * Pega "R$", números com vírgula decimal em contexto de dinheiro, e as
 * palavras que a IA não deveria usar afirmando valor.
 */
export function replyLeaksPrice(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (/r\$|\breais\b/.test(t)) return true;
  // "custa 120", "sai por 89,90", "fica 250"
  if (/\b(custa|sai por|fica em|fica por|por apenas|a partir de)\s*\d/.test(t)) return true;
  // Promessa de orçamento fechado pela IA.
  if (/(segue o or[çc]amento|or[çc]amento fica|valor total|te passo o valor de)\b/.test(t)) {
    return true;
  }
  return false;
}

/** Está dentro do horário comercial de Brasília? */
export function isBusinessHour(now: Date = new Date()): boolean {
  // America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
  const h = new Date(now.getTime() - 3 * 60 * 60 * 1000).getUTCHours();
  const dow = new Date(now.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
  if (dow === 0) return false; // domingo
  return h >= BUSINESS_START_HOUR && h < BUSINESS_END_HOUR;
}

/** Cliente pediu pra parar de receber mensagens. */
export function isOptOut(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  return /^(pare|parar|sair|remover|descadastrar|nao quero|não quero|stop)\b/.test(t);
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

export function buildSystemPrompt(opts: {
  lead?: LeadContext | null;
  produtos?: string[];
}): string {
  const l = opts.lead;
  const quem = l?.name ? `O contato se chama ${l.name}.` : '';
  const ramo = l?.category ? `Ramo dele: ${l.category}.` : '';
  const onde = l?.neighborhood || l?.city ? `Fica em ${l.neighborhood || l.city}.` : '';
  const cat =
    opts.produtos && opts.produtos.length
      ? `Produtos que temos pra esse perfil (cite pelo nome, NUNCA com preço): ${opts.produtos.join('; ')}.`
      : '';

  return [
    'Você é o atendente virtual da Cali Colors, loja de tintas em Guarulhos/SP,',
    'atendendo pelo WhatsApp. A Cali Colors também mantém o QueroUmaCor, um app',
    'que conecta pintores e clientes (entrar é gratuito).',
    quem,
    ramo,
    onde,
    cat,
    '',
    'REGRAS ABSOLUTAS:',
    '1. NUNCA informe preço, valor, desconto, condição de pagamento ou frete.',
    '   NUNCA faça orçamento. Isso é feito por uma pessoa da equipe.',
    '2. Se pedirem preço ou orçamento, responda que vai verificar com a equipe',
    '   e retorna em breve — e marque precisa_humano=true.',
    '3. Não invente produto, prazo de entrega, estoque nem promessa de prazo.',
    '4. Se for reclamação, cobrança, assunto delicado ou algo fora de tinta e',
    '   pintura, marque precisa_humano=true.',
    '5. Você é um assistente; se perguntarem, diga que é o atendimento virtual',
    '   da Cali Colors e que uma pessoa pode continuar o atendimento.',
    '',
    'ESTILO: português do Brasil, informal e direto, como se fosse WhatsApp.',
    'No máximo 3 frases curtas. Sem emoji em excesso (no máximo 1).',
    '',
    'Responda SEMPRE em JSON puro, sem markdown, no formato:',
    '{"resposta":"texto pro cliente","precisa_humano":true|false,"motivo":"preco|orcamento|humano|null"}',
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Chamada ao modelo ──────────────────────────────────────────────────────

interface OpenAiChoice {
  message?: { content?: string };
}
interface OpenAiResponse {
  choices?: OpenAiChoice[];
  error?: { message?: string };
}

export function getAiModel(): string {
  return getRuntimeEnv('WHATSAPP_AI_MODEL') || DEFAULT_AI_MODEL;
}

export function isAiConfigured(): boolean {
  return Boolean(getRuntimeEnv('OPENAI_API_KEY'));
}

/**
 * Gera a resposta pro cliente. Já aplica as travas: escala antes de
 * chamar o modelo quando o cliente pede preço, e escala depois quando a
 * resposta do modelo vaza valor.
 */
export async function generateAiReply(opts: {
  lead?: LeadContext | null;
  produtos?: string[];
  /** Histórico em ordem cronológica; só as últimas trocas importam. */
  turns: ConversationTurn[];
}): Promise<AiReplyResult> {
  const ultima = [...opts.turns].reverse().find((t) => t.direction === 'in');
  const textoCliente = ultima?.body || '';

  // Trava 1: pedido explícito de preço/orçamento nem chega no modelo.
  const pedido = clientAsksForPrice(textoCliente);
  if (pedido) {
    return {
      reply:
        'Boa pergunta! Vou verificar isso com a equipe e te respondo em breve, tá? 👍',
      escalate: true,
      reason: pedido,
    };
  }

  const key = getRuntimeEnv('OPENAI_API_KEY');
  if (!key) throw new ServiceError('OPENAI_API_KEY não configurada', 503);

  // Só as últimas 8 trocas — contexto curto é mais barato e mais preciso.
  const historico = opts.turns.slice(-8).map((t) => ({
    role: t.direction === 'in' ? ('user' as const) : ('assistant' as const),
    content: (t.body || '').slice(0, 700),
  }));

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getAiModel(),
        temperature: 0.4,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt({ lead: opts.lead, produtos: opts.produtos }) },
          ...historico,
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch {
    throw new ServiceError('falha de rede ao chamar a IA', 502);
  }

  let data: OpenAiResponse = {};
  try {
    data = (await res.json()) as OpenAiResponse;
  } catch {
    /* status decide abaixo */
  }
  if (!res.ok || data.error) {
    throw new ServiceError(
      `IA recusou a chamada: ${(data.error?.message || `HTTP ${res.status}`).slice(0, 160)}`,
      502,
    );
  }

  const bruto = data.choices?.[0]?.message?.content || '';
  let parsed: { resposta?: unknown; precisa_humano?: unknown; motivo?: unknown } = {};
  try {
    parsed = JSON.parse(bruto) as typeof parsed;
  } catch {
    // Modelo fugiu do JSON: trata o texto cru como resposta, mas escala
    // por precaução (não sabemos se respeitou as regras).
    return {
      reply: 'Vou verificar isso e te respondo em breve!',
      escalate: true,
      reason: 'humano',
    };
  }

  const resposta = typeof parsed.resposta === 'string' ? parsed.resposta.trim() : '';
  const precisaHumano = parsed.precisa_humano === true;
  const motivo =
    parsed.motivo === 'preco' || parsed.motivo === 'orcamento' || parsed.motivo === 'humano'
      ? parsed.motivo
      : null;

  // Trava 2: a IA vazou preço? Não envia; escala.
  if (replyLeaksPrice(resposta)) {
    return {
      reply: 'Vou confirmar essa informação com a equipe e já te retorno! 👍',
      escalate: true,
      reason: 'preco',
    };
  }

  if (!resposta) {
    return { reply: '', escalate: true, reason: 'humano' };
  }

  return {
    reply: resposta,
    escalate: precisaHumano,
    reason: precisaHumano ? motivo || 'humano' : null,
  };
}
