// ErrorsAdmin — client component do dashboard de erros. Chama a API
// `/api/admin/errors-list` (POST com accessToken no body, mesmo contrato
// que o portal usa) com filtros de tipo/janela/busca. Leitura pura — a
// tabela `errors` não tem ação administrativa além de olhar.

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { getTimeAgo } from '@/lib/utils';
import { ListSkeleton } from '@/components/Skeletons';
import { FAILURE_TYPE_LABELS } from '@/lib/utils/reportFailure';

interface ErrorRow {
  id: string;
  created_at: string;
  type: string | null;
  msg: string | null;
  stack: string | null;
  url: string | null;
  ua: string | null;
  metric: string | null;
  value: number | null;
  ctx: string | null;
  user_id: string | null;
  client_ts: string | null;
}

interface ErrorsListResult {
  rows: ErrorRow[];
  total: number;
}

// Os chips saem da MESMA lista que o `reportFailure` usa pra gravar, então
// falha nova nasce com filtro. Antes eram 5 chips escritos à mão pra 12
// tipos gravados — e o primeiro deles era o `scrollpin-diag`, diagnóstico
// removido em 30/08. Ele fica no fim, pelas linhas históricas.
const TYPE_FILTERS: { label: string; value: string }[] = [
  { label: 'Todos', value: '' },
  ...Object.entries(FAILURE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  { label: '🔥 SW 5xx', value: 'sw-nav-5xx' },
  { label: 'JS error', value: 'error' },
  { label: 'Web Vitals', value: 'web-vital' },
  { label: '📌 Scroll pin (histórico)', value: 'scrollpin-diag' },
];

const SINCE_OPTIONS: { label: string; value: number }[] = [
  { label: 'Últimas 24h', value: 24 },
  { label: '3 dias', value: 72 },
  { label: '7 dias', value: 168 },
  { label: '30 dias', value: 720 },
];

async function fetchErrors(filters: {
  type: string;
  since_hours: number;
  search: string;
}): Promise<ErrorsListResult> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sessão expirada — entre de novo.');
  const res = await fetch('/api/admin/errors-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken,
      limit: 100,
      type: filters.type || undefined,
      since_hours: filters.since_hours,
      // Buscar "o erro do fulano" precisa filtrar por PESSOA. O `search`
      // antigo só casava em `msg`, onde o id nunca aparece.
      search: UUID_RE.test(filters.search) ? undefined : filters.search || undefined,
      user_id: UUID_RE.test(filters.search) ? filters.search : undefined,
    }),
  });
  const json = (await res.json()) as ErrorsListResult & { error?: string };
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  'scrollpin-diag': { bg: '#e8f0fe', fg: '#2563eb' },
  'sw-nav-5xx': { bg: '#fde8e8', fg: '#c81e1e' },
  error: { bg: '#fff1e8', fg: '#d2541f' },
  'publish-fail': { bg: '#fde8e8', fg: '#c81e1e' },
  'avatar-fail': { bg: '#fde8e8', fg: '#c81e1e' },
  'render-error': { bg: '#fde8e8', fg: '#c81e1e' },
  'picker-restart': { bg: '#fff1e8', fg: '#d2541f' },
};

/** A busca virou UUID? Aí ela filtra por PESSOA, não por mensagem. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ErrorsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [type, setType] = useState('');
  const [sinceHours, setSinceHours] = useState(72);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['admin-errors', type, sinceHours, search],
    queryFn: () => fetchErrors({ type, since_hours: sinceHours, search }),
    enabled: !!user,
    staleTime: 30_000,
  });

  if (authLoading) return <ListSkeleton count={4} />;

  return (
    <div>
      {/* Filtros: chips de tipo + janela + busca */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-1 hide-scrollbar">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setType(f.value)}
            className="flex-shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 border"
            style={{
              background: type === f.value ? 'var(--color-ink)' : 'var(--color-white)',
              color: type === f.value ? '#fff' : 'var(--color-ink)',
              borderColor: 'var(--color-border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        <select
          value={sinceHours}
          onChange={(e) => setSinceHours(Number(e.target.value))}
          className="text-sm border border-[color:var(--color-border)] rounded-lg px-2 py-2 bg-white"
          aria-label="Janela de tempo"
        >
          {SINCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Mensagem ou ID do usuário…"
            className="flex-1 min-w-0 text-sm border border-[color:var(--color-border)] rounded-lg px-3 py-2 bg-white"
            aria-label="Buscar na mensagem"
          />
          <button
            type="submit"
            className="text-sm font-semibold px-3 py-2 rounded-lg text-white"
            style={{ background: 'var(--color-p1)' }}
          >
            Buscar
          </button>
        </form>
      </div>

      {query.isLoading ? <ListSkeleton count={4} /> : null}
      {query.error ? (
        <p className="text-sm text-red-600 py-4">
          Erro ao carregar: {(query.error as Error).message}
        </p>
      ) : null}

      {query.data ? (
        <>
          <p className="text-xs text-[color:var(--color-muted)] mb-3">
            {query.data.total} registro{query.data.total === 1 ? '' : 's'} na
            janela (mostrando até 100).
          </p>
          {query.data.rows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)] py-8 text-center">
              Nenhum registro com esses filtros. 🎉
            </p>
          ) : (
            <ul className="space-y-2">
              {query.data.rows.map((r) => {
                const badge = TYPE_BADGE[r.type ?? ''] ?? {
                  bg: 'var(--color-cream)',
                  fg: 'var(--color-muted)',
                };
                return (
                  <li
                    key={r.id}
                    className="bg-white border border-[color:var(--color-border)] rounded-xl p-3"
                  >
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: badge.bg, color: badge.fg }}
                      >
                        {r.type || 'sem tipo'}
                      </span>
                      <span
                        className="text-[11px] text-[color:var(--color-muted)]"
                        title={r.created_at}
                      >
                        {getTimeAgo(r.created_at)}
                      </span>
                      {r.url ? (
                        <span className="text-[11px] text-[color:var(--color-muted)] truncate max-w-[180px]">
                          {r.url}
                        </span>
                      ) : null}
                      {/* Sem isto não dá pra saber DE QUEM é a linha — o
                          campo já vinha do servidor e morria aqui. Clicar
                          filtra por essa pessoa. */}
                      {r.user_id ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchInput(r.user_id!);
                            setSearch(r.user_id!);
                          }}
                          title={`Ver só os erros de ${r.user_id}`}
                          className="text-[11px] font-mono underline text-[color:var(--color-muted)]"
                        >
                          👤 {r.user_id.slice(0, 8)}
                        </button>
                      ) : null}
                    </div>
                    <p className="text-sm break-words whitespace-pre-wrap font-mono text-[13px]">
                      {r.msg || '(sem mensagem)'}
                    </p>
                    {r.ua ? (
                      <details className="mt-1.5">
                        <summary className="text-[11px] text-[color:var(--color-muted)] cursor-pointer">
                          user-agent
                        </summary>
                        <p className="text-[11px] font-mono break-all text-[color:var(--color-muted)] mt-1">
                          {r.ua}
                        </p>
                      </details>
                    ) : null}
                    {r.stack ? (
                      <details className="mt-1">
                        <summary className="text-[11px] text-[color:var(--color-muted)] cursor-pointer">
                          stack
                        </summary>
                        <pre className="text-[10px] overflow-x-auto text-[color:var(--color-muted)] mt-1">
                          {r.stack}
                        </pre>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
