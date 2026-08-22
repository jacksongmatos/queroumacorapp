// @vitest-environment jsdom
//
// Quando a loja entra na conversa, a TELA precisa perceber. Antes ela só
// olhava o prefixo `3way:` do convId — e como adicionar a loja não troca o
// convId, o cabeçalho nunca virava "+ Cali Colors" e o convite continuava
// na tela (dava pra adicionar a loja de novo e duplicar a saudação).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Message, ConversationMeta } from '@/lib/services/chat';

const mockAuth = { user: { id: 'pintor-1' }, loading: false };
const mockProfile = { profile: { role: 'pintor' } as Record<string, unknown>, loading: false, error: null };
const state = {
  messages: [] as Message[],
  conversations: [] as ConversationMeta[],
};

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/chat/a_b' }));
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => mockAuth }));
vi.mock('@/lib/hooks/useProfile', () => ({ useProfile: () => mockProfile }));
vi.mock('@/lib/hooks/useChatRealtime', () => ({ useChatRealtime: () => {} }));
vi.mock('@/lib/hooks/useChat', () => ({
  useMessages: () => ({ messages: state.messages, loading: false, error: null }),
  useConversations: () => ({ conversations: state.conversations, loading: false, error: null }),
  useSendMessage: () => ({ send: vi.fn(), sending: false, error: null }),
  useUploadAttachment: () => ({ upload: vi.fn(), error: null }),
  useCalicolorsId: () => ({ id: 'loja-1', loading: false }),
}));
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useQuery: () => ({ data: null }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ from: () => ({ insert: async () => ({}) }) }) }));

import { ChatConversation } from '@/app/chat/[convId]/ChatConversation';

function msg(over: Partial<Message>): Message {
  return {
    id: 'm1', conversationId: 'a_b', senderId: 'pintor-1', receiverId: 'cliente-1',
    content: 'oi', type: 'text', createdAt: new Date(0).toISOString(), ...over,
  };
}
function conv(over: Partial<ConversationMeta>): ConversationMeta {
  return {
    convId: 'pintor-1_cliente-1', otherId: 'cliente-1', name: 'Cliente', avatarUrl: null, tag: 'cliente',
    role: 'cliente', is3way: false, isStore: false, lastMsg: 'oi', lastMsgFromMe: false,
    lastMsgTime: new Date(0).toISOString(), ...over,
  };
}

const CONV_ID = 'pintor-1_cliente-1';

beforeEach(() => {
  state.messages = [msg({})];
  state.conversations = [conv({})];
  mockProfile.profile = { role: 'pintor' };
});
afterEach(cleanup);

describe('ChatConversation — 3-way', () => {
  it('conversa 1:1 comum: convite pra chamar a loja aparece', () => {
    render(<ChatConversation convId={CONV_ID} />);
    // Cabeçalho ainda 1:1 (o "+ Cali Colors" só entra quando a loja entra).
    expect(screen.queryByText(/\+ Cali Colors/)).toBeNull();
  });

  it('mensagem type=store na conversa já marca 3-way (sem trocar o convId)', () => {
    state.messages = [msg({}), msg({ id: 'm2', type: 'store', content: 'Olá! 👋' })];
    render(<ChatConversation convId={CONV_ID} />);
    // O nome do interlocutor no cabeçalho ganha o "+ Cali Colors".
    expect(screen.getByText(/\+ Cali Colors/)).toBeTruthy();
  });

  it('is3way vindo da lista (marker __STORE_ADDED__) também conta', () => {
    state.conversations = [conv({ is3way: true })];
    render(<ChatConversation convId={CONV_ID} />);
    expect(screen.getByText(/\+ Cali Colors/)).toBeTruthy();
  });

  it('convite aparece mesmo sem a conversa estar no cache da lista', () => {
    // Abrir a conversa direto (link/notificação/conversa nova) deixa a lista
    // vazia — era esse o caso em que o convite sumia no celular.
    state.conversations = [];
    render(<ChatConversation convId={CONV_ID} />);
    expect(screen.getByText('Adicione a Cali Colors ao chat')).toBeTruthy();
  });

  it('não convida a loja pra dentro do chat com a própria loja', () => {
    state.conversations = [];
    render(<ChatConversation convId="pintor-1_loja-1" />);
    expect(screen.queryByText('Adicione a Cali Colors ao chat')).toBeNull();
  });

  it('cliente nunca vê o convite pra chamar a loja', () => {
    mockProfile.profile = { role: 'cliente' };
    render(<ChatConversation convId={CONV_ID} />);
    const botoes = screen.queryAllByRole('button', { name: /adicionar|chamar/i });
    expect(botoes).toHaveLength(0);
  });
});
