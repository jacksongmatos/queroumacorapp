// usePriceTable — carrega a Tabela de Preços da ABRAPP uma vez e mantém em
// cache. A tabela muda uma vez por ano, então `staleTime` é longo de
// propósito: refetch a cada foco de janela seria 60KB à toa.

'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchPriceTable, type PriceItem } from '@/lib/services/priceTable';

export function usePriceTable() {
  const q = useQuery<PriceItem[], Error>({
    queryKey: ['price-table', 'ABRAPP 2026'],
    queryFn: fetchPriceTable,
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    items: q.data ?? [],
    loading: q.isLoading,
    error: q.error ?? null,
    refetch: q.refetch,
    // Lista vazia SEM erro = a migration ainda não rodou (o service converte
    // o 42P01 em lista vazia). A tela usa isso pra dar a mensagem certa em
    // vez de fingir que é problema de conexão.
    vazio: !q.isLoading && !q.error && (q.data?.length ?? 0) === 0,
  };
}
