// Página /alice — designer de interiores pra cliente final. Espelha
// estrutura do /seu-ze (RSC shell + client component que faz o chat).

import type { Metadata } from 'next';
import { AliceChat } from './AliceChat';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  // Página autenticada — fora do índice de busca.
  robots: { index: false, follow: false },
  title: 'Alice Codessi | QueroUmaCor',
  description:
    'Designer de interiores virtual da Cali Colors. Tire dúvidas sobre cores, paletas, estilos de ambiente. Chat por texto ou voz.',
};

export default function AlicePage() {
  return (
    <AppShell><div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Alice Codessi
      </h1>
      <p className="text-sm text-[color:var(--color-muted)] mb-6">
        Sua designer de interiores de bolso. Pergunte sobre cor, paleta,
        estilo — texto ou voz.
      </p>
      {/* flex-1 + min-h-0: o painel ocupa o que sobra da tela e NUNCA
          passa disso — antes tinha altura fixa em vh e o campo de
          digitar caía atrás da barra de baixo. */}
      <div className="flex-1 min-h-0">
        <AliceChat />
      </div>
    </div></AppShell>
  );
}
