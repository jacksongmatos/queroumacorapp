// @vitest-environment jsdom
//
// Três problemas relatados no story (01/09/2026):
//   1. o X não aparecia — o viewer era z-50 e a BottomNav é z-[300], então
//      as barras de progresso e o botão de fechar ficavam POR BAIXO das
//      barras do app;
//   2. não dava pra fechar com o botão VOLTAR do Android (no Instagram dá);
//   3. o vídeo mostrava o PLAY gigante do player nativo por um segundo.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('@/lib/hooks/useStories', () => ({
  useStories: () => ({ markSeen: vi.fn(), groups: [], loading: false }),
}));
vi.mock('@/lib/config', () => ({ Config: { stories: { DURATION_MS: 5000 } } }));

import { StoryViewer } from '@/components/StoryViewer';

const grupoFoto = [
  {
    profile: { id: 'u1', name: 'Pintor', tag: 'pintor', avatar_url: null },
    stories: [{ id: 's1', media_url: 'https://x/f.jpg', media_type: 'image' }],
  },
];
const grupoVideo = [
  {
    profile: { id: 'u1', name: 'Pintor', tag: 'pintor', avatar_url: null },
    stories: [{ id: 's2', media_url: 'https://x/v.mp4', media_type: 'video' }],
  },
];

type Grupos = Parameters<typeof StoryViewer>[0]['groups'];

beforeEach(() => {
  // jsdom não implementa play(); sem isto o efeito de autoplay explode.
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('StoryViewer — dá pra fechar', () => {
  it('fica ACIMA das barras do app (era o que escondia o X)', () => {
    const { container } = render(
      <StoryViewer groups={grupoFoto as unknown as Grupos} initialGroupIndex={0} onClose={vi.fn()} />,
    );
    const raiz = container.querySelector('[role="dialog"]');
    // BottomNav é z-[300]; o viewer precisa vencer isso.
    expect(raiz?.className).toContain('z-[400]');
  });

  it('tem botão de fechar com rótulo e alvo grande', () => {
    const onClose = vi.fn();
    render(
      <StoryViewer groups={grupoFoto as unknown as Grupos} initialGroupIndex={0} onClose={onClose} />,
    );
    const btn = screen.getByLabelText('Fechar stories');
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o VOLTAR do Android fecha o story em vez de sair da tela', () => {
    const onClose = vi.fn();
    render(
      <StoryViewer groups={grupoFoto as unknown as Grupos} initialGroupIndex={0} onClose={onClose} />,
    );
    // O viewer empurra uma entrada ao abrir; o "voltar" consome ela.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('StoryViewer — vídeo entra sem o PLAY gigante', () => {
  it('tem poster vazio e tenta tocar sozinho', () => {
    const { container } = render(
      <StoryViewer groups={grupoVideo as unknown as Grupos} initialGroupIndex={0} onClose={vi.fn()} />,
    );
    const v = container.querySelector('video');
    expect(v?.getAttribute('poster')).toContain('data:image/gif');
    expect(v?.hasAttribute('autoplay')).toBe(true);
    expect(v?.hasAttribute('playsinline')).toBe(true);
    // O `autoPlay` sozinho é bloqueado na WebView (exige gesto) e o player
    // nativo desenha o PLAY; a chamada explícita aproveita o gesto do toque.
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
