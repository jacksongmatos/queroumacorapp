// Página /senna — assistente IA pro funileiro/automotivo. Espelha
// estrutura do /seu-ze (RSC shell + client component).

import type { Metadata } from 'next';
import { SennaChat } from './SennaChat';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  // Página autenticada — fora do índice de busca.
  robots: { index: false, follow: false },
  title: 'Senna | QueroUmaCor',
  description:
    'Assistente IA pra funileiro e pintor automotivo — PU 2K, primer, verniz, lanternagem, polimento. Chat por texto ou voz.',
};

export default function SennaPage() {
  return (
    <AppShell><div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Senna
      </h1>
      <p className="text-sm text-[color:var(--color-muted)] mb-6">
        Mestre da oficina. Pergunte sobre tinta, lanternagem, polimento,
        ceramic coating.
      </p>
      {/* flex-1 + min-h-0: o painel ocupa o que sobra da tela e NUNCA
          passa disso — antes tinha altura fixa em vh e o campo de
          digitar caía atrás da barra de baixo. */}
      <div className="flex-1 min-h-0">
        <SennaChat />
      </div>
    </div></AppShell>
  );
}
