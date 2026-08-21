// Página /seu-ze — Server Component shell.
// Equivalente ao modal `#ai-chat-modal` do vanilla (openAiChat em
// modules/ai-chat.js). Aqui é tela dedicada em vez de modal — mesmo padrão
// de /agenda, /pedidos, /leads (RSC monta layout estático; client component
// hidrata o conteúdo dinâmico).
//
// Gating PRO: a checagem visual fica no SeuZeChat (client component) usando
// `useAuth()` + `canSeeProFeature`. A camada server-side dos endpoints
// (chat-ai, transcribe, tts) já valida PRO via gateProAI — então mesmo se a
// UI vazasse, o backend rejeita.

import type { Metadata } from 'next';
import { SeuZeChat } from './SeuZeChat';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  // Página autenticada — fora do índice de busca.
  robots: { index: false, follow: false },
  title: 'Seu Zé | QueroUmaCor',
  description:
    'Assistente IA para pintores — tire dúvidas, pergunte sobre preço, técnicas, materiais e ferramentas. Chat por texto ou voz.',
};

export default function SeuZePage() {
  return (
    <AppShell><div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Seu Zé
      </h1>
      <p className="text-sm text-[color:var(--color-muted)] mb-6">
        Seu mestre de obras de bolso. Pergunte sobre tinta, preço, técnica,
        material — texto ou voz.
      </p>
      {/* flex-1 + min-h-0: o painel ocupa o que sobra da tela e NUNCA
          passa disso — antes tinha altura fixa em vh e o campo de
          digitar caía atrás da barra de baixo. */}
      <div className="flex-1 min-h-0">
        <SeuZeChat />
      </div>
    </div></AppShell>
  );
}
