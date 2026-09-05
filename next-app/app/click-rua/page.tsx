// Página /click-rua — mesma banca que o tile abre em bottom-sheet no perfil.
// Existe pra deep link (dá pra mandar o link da revista no chat).

import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ClickRuaView } from './ClickRuaView';

export const metadata: Metadata = {
  title: 'Revista Click Rua | QueroUmaCor',
  description:
    'Click Rua, revista digital de graffiti do Brasil inteiro. Leia as edições direto no app.',
};

export default function ClickRuaPage() {
  return (
    <AppShell>
      <ClickRuaView />
    </AppShell>
  );
}
