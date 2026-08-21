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
    <AppShell><div className="min-h-full p-4 max-w-3xl mx-auto pb-24">
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
      <AliceChat />
    </div></AppShell>
  );
}
