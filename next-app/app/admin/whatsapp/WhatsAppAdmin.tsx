// WhatsAppAdmin — client component da tela /admin/whatsapp (SQL Wave 38).
// Formulário de envio (POST /api/whatsapp/send, admin-only) + lista das
// mensagens do número oficial em estilo conversa (recebidas à esquerda,
// enviadas à direita). Poll de 15s + refetch on focus: mensagem nova
// aparece sem realtime (tabela não está na publication do Supabase).

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { isAdmin } from '@/lib/policies';
import { usePolicyUser } from '@/lib/hooks/usePolicyUser';
import { getTimeAgo } from '@/lib/utils';
import { ListSkeleton } from '@/components/Skeletons';
import {
  fetchWhatsAppMessages,
  sendWhatsAppFromAdmin,
  type WhatsAppDirection,
  type WhatsAppMessageRow,
} from '@/lib/services/adminWhatsApp';

type Filter = WhatsAppDirection | 'all';
const FILTERS: { label: string; value: Filter }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Recebidas', value: 'in' },
  { label: 'Enviadas', value: 'out' },
];

export function WhatsAppAdmin() {
  const { user, loading: authLoading } = useAuth();
  const policyUser = usePolicyUser();
  const admin = isAdmin(policyUser);
  const [filter, setFilter] = useState<Filter>('all');
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-whatsapp', filter],
    queryFn: () => fetchWhatsAppMessages({ direction: filter, limit: 100 }),
    enabled: !!user && admin,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const sendMut = useMutation({
    mutationFn: () => sendWhatsAppFromAdmin({ to, body }),
    onSuccess: () => {
      setBody('');
      setFeedback({ kind: 'ok', text: 'Mensagem enviada ✅' });
      qc.invalidateQueries({ queryKey: ['admin-whatsapp'] });
    },
    onError: (e) => {
      setFeedback({
        kind: 'err',
        text: (e as Error).message || 'Falha ao enviar',
      });
    },
  });

  if (authLoading) return <ListSkeleton count={3} itemHeight={80} />;
  if (!user) {
    return <p className="text-sm text-[color:var(--color-muted)]">Faça login.</p>;
  }
  if (!admin) {
    return (
      <p className="text-sm text-[color:var(--color-muted)]">
        Sem acesso. Esta área é restrita ao painel admin.
      </p>
    );
  }

  return (
    <div>
      {/* ─── Envio ─────────────────────────────────────────────────────── */}
      <form
        className="p-4 rounded-xl bg-white border border-[color:var(--color-border)] mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          setFeedback(null);
          sendMut.mutate();
        }}
      >
        <p className="text-sm font-semibold mb-3">Enviar mensagem</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input
            type="tel"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Número — ex.: (11) 98888-7777"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[color:var(--color-border)] text-base"
            required
          />
        </div>
        <div className="flex gap-2 items-end">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Mensagem…"
            rows={2}
            maxLength={4096}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[color:var(--color-border)] text-base resize-y"
            required
          />
          <button
            type="submit"
            disabled={sendMut.isPending || !to.trim() || !body.trim()}
            className="px-4 py-2 rounded-full bg-[color:var(--color-ink)] text-white text-sm font-semibold disabled:opacity-50 flex-shrink-0"
          >
            {sendMut.isPending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        {feedback ? (
          <p
            className={
              'text-xs mt-2 ' + (feedback.kind === 'ok' ? 'text-green-700' : 'text-red-600')
            }
            role="status"
          >
            {feedback.text}
          </p>
        ) : null}
      </form>

      {/* ─── Filtros ───────────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3 hide-scrollbar">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex-shrink-0 ' +
                (active
                  ? 'bg-[color:var(--color-ink)] text-white border-[color:var(--color-ink)]'
                  : 'bg-white text-[color:var(--color-ink)] border-[color:var(--color-border)]')
              }
              aria-pressed={active}
            >
              {f.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ['admin-whatsapp'] })}
          className="ml-auto px-3 py-1.5 rounded-full text-xs font-semibold border border-[color:var(--color-border)] bg-white flex-shrink-0"
        >
          ↻ Atualizar
        </button>
      </div>

      {/* ─── Lista ─────────────────────────────────────────────────────── */}
      {query.isLoading ? (
        <ListSkeleton count={5} itemHeight={64} />
      ) : query.error ? (
        <p className="text-sm text-red-600">
          Erro: {(query.error as Error).message || 'falha ao carregar'}
        </p>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="text-center py-10 px-4 rounded-xl bg-white border border-[color:var(--color-border)]">
          <div className="text-4xl mb-3" aria-hidden="true">💬</div>
          <p className="text-sm text-[color:var(--color-muted)]">
            Nenhuma mensagem registrada ainda. Mande um WhatsApp pro número
            oficial (ou envie um acima) e ela aparece aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {query.data!.map((m) => (
            <MessageRow key={m.id} msg={m} onReply={(waId) => setTo(waId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({
  msg,
  onReply,
}: {
  msg: WhatsAppMessageRow;
  onReply: (waId: string) => void;
}) {
  const inbound = msg.direction === 'in';
  const who = inbound
    ? `${msg.profile_name || 'Sem nome'} · ${msg.wa_id}`
    : `Cali Colors → ${msg.wa_id}`;
  const content =
    msg.body || (msg.template ? `[template: ${msg.template}]` : `[${msg.type}]`);

  return (
    <div className={'flex ' + (inbound ? 'justify-start' : 'justify-end')}>
      <div
        className={
          'max-w-[85%] p-3 rounded-xl border text-sm ' +
          (inbound
            ? 'bg-white border-[color:var(--color-border)]'
            : 'bg-green-50 border-green-200')
        }
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold">{who}</span>
          <span className="text-xs text-[color:var(--color-muted)]">
            {getTimeAgo(msg.wa_timestamp || msg.created_at)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words">{content}</p>
        {inbound ? (
          <button
            type="button"
            onClick={() => onReply(msg.wa_id)}
            className="mt-2 text-xs font-semibold text-[color:var(--color-ink)] underline"
          >
            Responder
          </button>
        ) : null}
      </div>
    </div>
  );
}
