// Página /fe — assistente IA pro grafiteiro/muralista. Espelha estrutura
// do /seu-ze (RSC shell + client component).

import type { Metadata } from 'next';
import { FeChat } from './FeChat';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  // Página autenticada — fora do índice de busca.
  robots: { index: false, follow: false },
  title: 'Fê | QueroUmaCor',
  description:
    'Assistente IA pra grafiteiro e muralista — spray, técnica, mural, preço, legalidade. Chat por texto ou voz.',
};

export default function FePage() {
  return (
    <AppShell><div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Fê
      </h1>
      <p className="text-sm text-[color:var(--color-muted)] mb-6">
        Seu irmão da cena. Manda dúvida sobre spray, técnica, mural, preço.
      </p>
      {/* flex-1 + min-h-0: o painel ocupa o que sobra da tela e NUNCA
          passa disso — antes tinha altura fixa em vh e o campo de
          digitar caía atrás da barra de baixo. */}
      <div className="flex-1 min-h-0">
        <FeChat />
      </div>
    </div></AppShell>
  );
}
