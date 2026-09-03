// /perfil/[id]/conexoes — listas de seguidores e seguindo, no formato do
// Instagram (abas com contagem, busca, linha com foto + nome + @tag +
// botão de ação). Antes os números do perfil eram texto morto: não dava
// pra ver QUEM segue nem descobrir gente por ali.
//
// Aba inicial pela query `?tab=seguidores|seguindo` (o link do header
// manda a certa conforme o número tocado).

import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ConnectionsView } from './ConnectionsView';

export const runtime = 'edge';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Conexões | QueroUmaCor',
  description: 'Seguidores e pessoas que este perfil segue.',
};

export default async function ConnectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ConnectionsView profileId={id} />
    </AppShell>
  );
}
