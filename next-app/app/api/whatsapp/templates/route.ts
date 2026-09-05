// app/api/whatsapp/templates/route.ts — lista os templates aprovados.
//
// Existe pra o portal parar de carregar uma lista ESCRITA A MÃO no código.
// Lista à mão de template envelhece do mesmo jeito que lista de pendência:
// alguém aprova um template novo no painel, ninguém mexe no código, e a
// tela segue oferecendo dois. Pior: se o nome mudar lá, o envio quebra e a
// tela continua mostrando o nome velho como se estivesse tudo certo.
//
// A Cloud API expõe `GET /{WABA_ID}/message_templates`, e o Dualhook
// espelha o contrato dela. Se ESTE endpoint não estiver espelhado, a rota
// responde 502 com o corpo cru — e o portal cai na lista embutida, que
// continua funcionando. Recurso novo não pode derrubar o que já funciona.
//
// Admin-only: o mesmo gate de `/api/whatsapp/send`. Os nomes de template
// não são segredo, mas a chave usada pra buscá-los é.

import { type NextRequest } from 'next/server';
import { getRuntimeEnv } from '@/lib/api/env';
import {
  getToken,
  isAdminEmail,
  jsonResponse,
  readBody,
  ServiceError,
  serviceErrorResponse,
} from '@/lib/api/security';
import { verifyAdminToken } from '@/lib/api/_services/_admin-helpers';
import {
  DUALHOOK_API_BASE,
  GRAPH_API_VERSION,
  getWabaId,
} from '@/lib/api/_services/whatsapp';

export const runtime = 'edge';

const TIMEOUT_MS = 12000;

/** Um `{{n}}` do corpo do template. */
export interface VariavelDeTemplate {
  /** 1-based, como a Meta numera. */
  indice: number;
  /** Exemplo cadastrado no painel, quando existe — vira placeholder. */
  exemplo: string | null;
}

export interface TemplateAprovado {
  nome: string;
  idioma: string;
  categoria: string;
  status: string;
  /** Corpo com os `{{n}}` ainda no lugar — o portal substitui pra prévia. */
  corpo: string | null;
  cabecalho: string | null;
  rodape: string | null;
  variaveis: VariavelDeTemplate[];
}

/**
 * Conta os `{{n}}` do corpo e casa com os exemplos do painel.
 *
 * Contamos pelo TEXTO, não pelo `example` — template pode ter variável sem
 * exemplo cadastrado, e nesse caso o campo tem que aparecer na tela mesmo
 * assim. O contrário (exemplo sem `{{n}}` no texto) é lixo de cadastro e é
 * ignorado.
 */
export function extrairVariaveis(
  corpo: string | null,
  exemplos: string[]
): VariavelDeTemplate[] {
  if (!corpo) return [];
  const indices = new Set<number>();
  for (const m of corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 20) indices.add(n);
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((indice) => ({ indice, exemplo: exemplos[indice - 1] ?? null }));
}

/** Normaliza um item da resposta da Meta/Dualhook. */
export function normalizarTemplate(bruto: unknown): TemplateAprovado | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const t = bruto as {
    name?: unknown;
    language?: unknown;
    category?: unknown;
    status?: unknown;
    components?: unknown;
  };
  const nome = typeof t.name === 'string' ? t.name : '';
  if (!nome) return null;

  let corpo: string | null = null;
  let cabecalho: string | null = null;
  let rodape: string | null = null;
  let exemplos: string[] = [];

  if (Array.isArray(t.components)) {
    for (const c of t.components as Array<Record<string, unknown>>) {
      const tipo = String(c?.type ?? '').toUpperCase();
      const texto = typeof c?.text === 'string' ? c.text : null;
      if (tipo === 'BODY') {
        corpo = texto;
        // A Meta manda os exemplos como array de arrays.
        const ex = (c?.example as { body_text?: unknown })?.body_text;
        if (Array.isArray(ex) && Array.isArray(ex[0])) {
          exemplos = (ex[0] as unknown[]).map((v) => String(v));
        }
      } else if (tipo === 'HEADER' && texto) {
        cabecalho = texto;
      } else if (tipo === 'FOOTER' && texto) {
        rodape = texto;
      }
    }
  }

  return {
    nome,
    idioma: typeof t.language === 'string' ? t.language : 'pt_BR',
    categoria: typeof t.category === 'string' ? t.category : 'UNKNOWN',
    status: typeof t.status === 'string' ? t.status : 'UNKNOWN',
    corpo,
    cabecalho,
    rodape,
    variaveis: extrairVariaveis(corpo, exemplos),
  };
}

export async function POST(request: NextRequest) {
  let body: { accessToken?: unknown } = {};
  try {
    body = ((await readBody(request, { maxBytes: 8 * 1024 })) || {}) as typeof body;
  } catch {
    body = {};
  }

  try {
    const token = getToken(request, body);
    const { callerId, email } = await verifyAdminToken(token);
    if (!callerId) throw new ServiceError('token inválido', 401);
    if (!isAdminEmail(email)) throw new ServiceError('não autorizado (email não admin)', 403);
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    return jsonResponse({ error: 'não autorizado' }, 401);
  }

  const apiKey = getRuntimeEnv('DUALHOOK_API_KEY');
  if (!apiKey) {
    return jsonResponse(
      { error: 'envio de WhatsApp não configurado (DUALHOOK_API_KEY ausente)' },
      503
    );
  }

  const url =
    `${DUALHOOK_API_BASE}/${GRAPH_API_VERSION}/${getWabaId()}/message_templates` +
    `?limit=100`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error('dualhook_templates_failed', { erro: e instanceof Error ? e.message : e });
    return jsonResponse(
      { error: 'não foi possível consultar os templates', upstreamStatus: 0 },
      500
    );
  }

  // Texto ANTES do parse: resposta não-JSON (proxy, HTML de erro) é
  // justamente o caso que precisa ser visto, e `res.json()` a engoliria.
  const cru = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('dualhook_templates_failed', { status: res.status, body: cru.slice(0, 500) });
    return jsonResponse(
      {
        error:
          `não foi possível listar os templates (HTTP ${res.status}). ` +
          'O portal está usando a lista embutida.',
        upstreamStatus: res.status,
      },
      res.status >= 400 && res.status < 500 ? 400 : 502
    );
  }

  let dados: { data?: unknown };
  try {
    dados = JSON.parse(cru) as { data?: unknown };
  } catch {
    console.error('dualhook_templates_failed', { status: res.status, body: cru.slice(0, 500) });
    return jsonResponse({ error: 'resposta de templates ilegível', upstreamStatus: res.status }, 502);
  }

  const lista = Array.isArray(dados.data) ? dados.data : [];
  const templates = lista
    .map(normalizarTemplate)
    .filter((t): t is TemplateAprovado => t !== null)
    // Só o que dá pra enviar. Template em rascunho ou reprovado na tela
    // seria um botão que sempre falha com 132001.
    .filter((t) => t.status.toUpperCase() === 'APPROVED');

  return jsonResponse({ ok: true, templates });
}
