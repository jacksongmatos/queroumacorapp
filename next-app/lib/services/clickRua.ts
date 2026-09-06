// clickRua (service) — lê as edições da revista da tabela
// `click_rua_editions`. As páginas ficam no bucket `click-rua`; a tabela
// guarda a URL de cada uma, em ordem.
//
// Fonte única é o banco: a loja sobe edição pelo portal e ela aparece no
// app sem deploy. O catálogo estático em `lib/clickRua.ts` só entra quando
// a tabela ainda não existe — deploy antes do SQL não pode deixar a banca
// vazia.

import { getSupabase } from '@/lib/supabase';
import { NetworkError } from '@/lib/errors';
import { edicaoDeLinha, EDICOES_FALLBACK, type Edicao, type LinhaEdicao } from '@/lib/clickRua';

type RawEdicao = LinhaEdicao;

// Cast manual — tabela nova, ainda fora do schema TS gerado. Mesmo padrão
// de artReferences/price_table_items.
function clickRuaClient() {
  return getSupabase() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => PromiseLike<{
          data: RawEdicao[] | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
}

export async function fetchEdicoesClickRua(): Promise<Edicao[]> {
  const { data, error } = await clickRuaClient()
    .from('click_rua_editions')
    .select('numero, quando, destaque, status, capa_url, paginas')
    .order('numero', { ascending: true });

  if (error) {
    // 42P01 = a migration ainda não rodou. Cai no catálogo publicado com o
    // app em vez de mostrar erro de rede com a internet perfeita.
    if (error.code === '42P01') return [...EDICOES_FALLBACK];
    throw new NetworkError(`Não foi possível carregar a revista: ${error.message}`);
  }
  const linhas = data ?? [];
  // Tabela existe mas está vazia: mesma coisa que não existir, do ponto de
  // vista de quem abriu a banca.
  if (linhas.length === 0) return [...EDICOES_FALLBACK];
  return linhas.map(edicaoDeLinha);
}
