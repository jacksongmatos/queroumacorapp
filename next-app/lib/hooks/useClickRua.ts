// useClickRua — edições da revista, com cache longo: a banca muda quando a
// loja publica uma edição, o que é raro. Refetch a cada foco de janela só
// gastaria rede.

'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchEdicoesClickRua } from '@/lib/services/clickRua';
import type { Edicao } from '@/lib/clickRua';

export function useClickRua() {
  const q = useQuery<Edicao[], Error>({
    queryKey: ['click-rua-edicoes'],
    queryFn: fetchEdicoesClickRua,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    edicoes: q.data ?? [],
    loading: q.isLoading,
    error: q.error ?? null,
  };
}
