// GET /pdf/<id> — o link CURTO do PDF de orçamento, no NOSSO domínio.
//
// Motivo (2026-08-30): o link que ia pro cliente era o endereço público
// inteiro do Supabase (~160 caracteres, com o nome do projeto no meio) —
// ocupava seis linhas no WhatsApp e parecia coisa de máquina. Não vaza
// segredo nenhum (é path público), mas o pedido do usuário está certo:
// "deveria ser algo mais simples".
//
// Agora a rota de upload guarda o PDF em `exports/l/<id>.pdf` (id curto,
// aleatório) e devolve `https://queroumacor.com.br/pdf/<id>`. Esta rota só
// redireciona pro arquivo no Storage — não toca em banco, não exige login
// (o arquivo já é público por design: o link vai pro cliente por
// WhatsApp). `?download=<nome>` é repassado pro Storage, que responde com
// Content-Disposition: attachment.

import type { NextRequest } from 'next/server';
import { getSupabaseUrl } from '@/lib/api/security';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Formato estrito do id gerado pela rota de upload: nada além dele
  // sai daqui — isto NÃO é um proxy genérico pro bucket.
  // {8,24} e não {10,24}: o gerador cria 9 caracteres, e a primeira
  // versão daqui exigia 10 — todo link curto respondia "não encontrado"
  // (visto em produção, 2026-08-30). Dois arquivos com o mesmo número
  // mágico é convite pra esse desencontro.
  if (!/^[a-z0-9]{8,24}$/.test(id)) {
    return new Response('não encontrado', { status: 404 });
  }
  let base: string;
  try {
    base = getSupabaseUrl().replace(/\/$/, '');
  } catch {
    return new Response('indisponível', { status: 503 });
  }
  // PROXY, não redirect (2026-08-30): o 302 abria o PDF, mas a barra de
  // endereço do navegador trocava pro endereço do Supabase — e o usuário
  // lia aquilo como "vazou a chave" (não vazou; é path público, mas a
  // percepção conta). Servindo os bytes daqui, a URL fica
  // queroumacor.com.br/pdf/<id> do início ao fim.
  const upstream = await fetch(
    `${base}/storage/v1/object/public/exports/l/${id}.pdf`,
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!upstream.ok) return new Response('não encontrado', { status: 404 });

  const download = request.nextUrl.searchParams.get('download');
  const nome = (download || 'orcamento.pdf')
    .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80) || 'orcamento.pdf';
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    // attachment baixa; inline abre no visualizador.
    'Content-Disposition': `${download !== null ? 'attachment' : 'inline'}; filename="${nome}"`,
    // O arquivo nunca muda (id aleatório, sem sobrescrita) — cache à vontade.
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);
  return new Response(upstream.body, { status: 200, headers });
}
