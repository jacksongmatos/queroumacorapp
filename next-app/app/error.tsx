'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { agendarRetomada } from '@/lib/utils/autoRetry';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Tenta se recuperar sozinha antes de pedir ajuda. O caso comum não é
  // um bug da tela: é o app voltando depois de horas fechado, com a rota
  // falhando por rede. `reset()` refaz o render sem recarregar a página
  // inteira — se não bastar, o próximo agendamento recarrega. Freio
  // compartilhado com o service worker (lib/utils/autoRetry).
  const [tentando, setTentando] = useState(false);

  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'route-error' } });
  }, [error]);

  useEffect(() => {
    const { agendado, cancelar } = agendarRetomada(reset);
    setTentando(agendado);
    return cancelar;
  }, [reset]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Algo deu errado
        </h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          {tentando
            ? 'Tivemos um problema ao carregar essa página. Estou tentando de novo sozinho…'
            : 'Tivemos um problema ao carregar essa página. A equipe já foi avisada.'}
        </p>
        {error.digest && (
          <p className="text-xs text-[color:var(--color-muted)] font-mono">
            Código: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--color-p1)' }}
          >
            Tentar de novo
          </button>
          <a
            href="/feed"
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-[color:var(--color-border)]"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </main>
  );
}
