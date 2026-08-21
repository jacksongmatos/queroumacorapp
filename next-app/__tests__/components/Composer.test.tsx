// @vitest-environment jsdom
//
// Composer — quem vê o "Marcar como venda" e onde o botão de legenda IA
// aparece. As duas regras dependem de estado que sobrevive a troca de aba
// (o toggle continua ligado depois de virar story), então o teste cobre
// tanto o que some da TELA quanto o que vai pro BANCO.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

const mockAuth = { user: { id: 'u1' } as { id: string } | null, loading: false };
const mockPolicyUser = {
  value: { id: 'u1', role: 'pintor' } as Record<string, unknown> | null,
};
const publishAsync =
  vi.fn<(input: Record<string, unknown>) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'p1' }),
  );

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/lib/hooks/usePolicyUser', () => ({
  usePolicyUser: () => mockPolicyUser.value,
}));

vi.mock('@/lib/hooks/usePublishPost', () => ({
  usePublishPost: () => ({
    publishAsync,
    reset: vi.fn(),
    isPending: false,
    error: null,
    progress: null,
  }),
}));

vi.mock('@/lib/hooks/useAutosave', () => ({
  useAutosave: () => ({ clear: vi.fn(), lastSavedAt: 0 }),
}));

import { Composer } from '@/app/publicar/Composer';

/** Anexa uma foto ao composer (mídia é obrigatória pra publicar). */
function attachPhoto() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'obra.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function switchToStory() {
  fireEvent.click(screen.getByText('Story'));
}

beforeEach(() => {
  // jsdom não implementa object URLs (o MediaPreview usa pra thumbnail).
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => {};
  publishAsync.mockClear();
  mockAuth.user = { id: 'u1' };
  mockPolicyUser.value = { id: 'u1', role: 'pintor' };
});

afterEach(() => {
  cleanup();
});

describe('Composer — "Marcar como venda"', () => {
  it('aparece pra pintor', () => {
    render(<Composer />);
    expect(screen.queryByTestId('for-sale-toggle')).toBeTruthy();
  });

  it('NÃO aparece pra cliente', () => {
    mockPolicyUser.value = { id: 'u1', role: 'cliente' };
    render(<Composer />);
    expect(screen.queryByTestId('for-sale-toggle')).toBeNull();
  });

  it('NÃO aparece na aba Story', () => {
    render(<Composer />);
    switchToStory();
    expect(screen.queryByTestId('for-sale-toggle')).toBeNull();
  });

  it('publica com for_sale=false se o toggle foi ligado e depois virou story', async () => {
    render(<Composer />);
    fireEvent.click(screen.getByTestId('for-sale-toggle'));
    switchToStory();
    attachPhoto();

    await act(async () => {
      fireEvent.click(screen.getByText('Publicar'));
    });

    expect(publishAsync).toHaveBeenCalledTimes(1);
    const payload = publishAsync.mock.calls[0][0];
    expect(payload.mediaType).toBe('story');
    expect(payload.forSale).toBe(false);
    expect(payload.price).toBeNull();
    expect(payload.artType).toBeNull();
  });
});

describe('Composer — legenda por IA', () => {
  it('mostra o botão em post', () => {
    render(<Composer />);
    expect(screen.queryByLabelText('Gerar legenda com IA')).toBeTruthy();
  });

  it('esconde o botão em story, mantendo o contador de caracteres', () => {
    render(<Composer />);
    switchToStory();
    expect(screen.queryByLabelText('Gerar legenda com IA')).toBeNull();
    expect(screen.getByText('0/2000')).toBeTruthy();
  });

  it('volta a mostrar o botão ao sair do story', () => {
    render(<Composer />);
    switchToStory();
    fireEvent.click(screen.getByText('Foto / Vídeo'));
    expect(screen.queryByLabelText('Gerar legenda com IA')).toBeTruthy();
  });
});
