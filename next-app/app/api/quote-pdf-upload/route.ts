// app/api/quote-pdf-upload/route.ts — o PDF do orçamento sobe pelo SERVIDOR.
//
// Por que existe (2026-08-30): o upload direto do app pro bucket `exports`
// falhava SEMPRE em produção — e falhou desde o primeiro dia (era isso que
// empurrava o compartilhar pro fallback de data URL que congelava o app).
// Upload pelo cliente depende de três coisas ao mesmo tempo: o bucket
// existir, as policies de RLS estarem certas e a sessão estar viva na hora
// exata do toque. Qualquer uma falhando, o pintor fica sem o PDF — e as
// três falham em silêncio.
//
// Esta rota corta as três dependências:
//   - sobe com a SERVICE ROLE, que não passa por policy nenhuma;
//   - se o bucket `exports` não existir, CRIA na hora (público, 10MB, só
//     application/pdf — os mesmos parâmetros da Wave 41) e tenta de novo;
//   - a única coisa que o app precisa ter é o token do usuário.
//
// O upload direto continua sendo o caminho rápido no client; esta rota é o
// plano B chamado quando ele falha. Não é anônima de propósito: endpoint
// de upload sem login vira hospedagem grátis de arquivo pra qualquer um.

import type { NextRequest } from 'next/server';
import {
  ServiceError,
  checkRateLimit,
  getServiceKey,
  getSupabaseUrl,
  jsonResponse,
  rateLimitResponse,
  requireAuthStrict,
  serviceErrorResponse,
} from '@/lib/api/security';

export const runtime = 'edge';

const BUCKET = 'exports';
const MAX_PDF_BYTES = 8 * 1024 * 1024; // bucket aceita 10MB; folga de cabeçalho
const UPLOAD_TIMEOUT_MS = 20_000;

export async function POST(request: NextRequest) {
  try {
    // Só usuário logado. O corpo é binário, então o token vem no header.
    const { user } = await requireAuthStrict(request);

    // 20/min por usuário: gerar orçamento é ação humana, ninguém legítimo
    // passa disso; acima é script usando a rota de depósito de arquivo.
    const rl = await checkRateLimit({
      userId: `quote-pdf:${user.id}`,
      endpoint: 'quote-pdf-upload',
      limit: 20,
    });
    if (!rl.allowed) return rateLimitResponse(rl);

    const serviceKey = getServiceKey();
    if (!serviceKey) {
      // Sem service role não há plano B — o app cai na mensagem de erro
      // normal. 503 explícito pra ficar óbvio no log o que falta.
      throw new ServiceError('servidor sem SUPABASE_SERVICE_ROLE_KEY', 503);
    }
    const supabaseUrl = getSupabaseUrl().replace(/\/$/, '');

    // Corpo = o PDF cru. Teto ANTES de ler quando o header existir; o
    // byteLength confere de verdade depois (Content-Length é opcional).
    const declared = Number(request.headers.get('content-length') || '0');
    if (declared > MAX_PDF_BYTES) {
      throw new ServiceError('PDF grande demais (máx 8MB)', 413);
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new ServiceError('PDF grande demais (máx 8MB)', 413);
    }
    if (bytes.byteLength < 5) throw new ServiceError('corpo vazio', 400);
    // Só PDF de verdade: os 5 primeiros bytes são "%PDF-". Barra qualquer
    // outra coisa que tentem depositar aqui.
    const head = new Uint8Array(bytes.slice(0, 5));
    const magic = String.fromCharCode(...head);
    if (magic !== '%PDF-') throw new ServiceError('o arquivo não é um PDF', 415);

    // Nome vem do app (x-filename) mas ninguém confia em nome de arquivo:
    // só [a-z0-9._-], sempre terminando em .pdf, com teto de tamanho.
    const cru = request.headers.get('x-filename') || 'orcamento.pdf';
    const filename =
      (cru.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) ||
        'orcamento') .replace(/(\.pdf)?$/, '') + '.pdf';

    // Path no MESMO padrão do upload direto (`<uid>/...`): se um dia as
    // policies passarem a valer, os dois caminhos convivem.
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${filename}`;

    const upload = () =>
      fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true',
        },
        body: bytes,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });

    let res = await upload();

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // Bucket nunca criado (a suspeita nº 1 do porquê de o upload direto
      // nunca ter funcionado): cria com os parâmetros da Wave 41 e tenta
      // de novo UMA vez. Bucket público serve leitura sem policy nenhuma.
      if (/bucket.*not.*found/i.test(errText) || res.status === 404) {
        const criar = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: BUCKET,
            name: BUCKET,
            public: true,
            file_size_limit: 10485760,
            allowed_mime_types: ['application/pdf'],
          }),
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        });
        // 409 = alguém criou no meio tempo — ótimo, segue pro retry.
        if (criar.ok || criar.status === 409) {
          res = await upload();
        }
      }
      if (!res.ok) {
        const finalText = errText || (await res.text().catch(() => ''));
        console.warn('[quote-pdf-upload] storage recusou:', res.status, finalText.slice(0, 300));
        throw new ServiceError('não consegui guardar o PDF', 502);
      }
    }

    return jsonResponse({
      ok: true,
      url: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`,
    });
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    console.error('quote-pdf-upload:', e);
    return jsonResponse({ error: 'internal' }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
