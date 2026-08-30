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
  if (!/^[a-z0-9]{10,24}$/.test(id)) {
    return new Response('não encontrado', { status: 404 });
  }
  let base: string;
  try {
    base = getSupabaseUrl().replace(/\/$/, '');
  } catch {
    return new Response('indisponível', { status: 503 });
  }
  const download = request.nextUrl.searchParams.get('download');
  const destino =
    `${base}/storage/v1/object/public/exports/l/${id}.pdf` +
    (download !== null ? `?download=${encodeURIComponent(download || '')}` : '');
  return Response.redirect(destino, 302);
}
