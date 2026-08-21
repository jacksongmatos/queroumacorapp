// @vitest-environment jsdom
//
// Teste de comportamento do tour guiado: auto-abertura na primeira vez,
// avanço passo a passo, botão de sair e persistência do "já vi".
//
// jsdom não faz layout — `getBoundingClientRect` devolve tudo zero e o
// <AppTour> descartaria todos os alvos. Por isso stubamos o rect só pros
// elementos com `data-tour` (simulando a BottomNav/TopNav renderizadas).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';

const mockPathname = { value: '/feed' };
const mockAuth = { user: { id: 'u1' } as { id: string } | null, loading: false };

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

import { AppTour } from '@/components/AppTour';
import { TOUR_STEPS } from '@/lib/tour/steps';

const NAV_IDS = ['nav-feed', 'nav-chat', 'nav-search', 'nav-loja', 'nav-notif', 'nav-perfil', 'nav-plano'];

/** Monta alvos falsos com rect não-nulo, imitando as barras de navegação. */
function mountNav(ids: string[] = NAV_IDS) {
  for (const [i, id] of ids.entries()) {
    const el = document.createElement('div');
    el.setAttribute('data-tour', id);
    el.getBoundingClientRect = () =>
      ({ top: 780, left: 20 + i * 50, width: 44, height: 44, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(el);
  }
}

/** Passa o delay de auto-abertura + o primeiro tick de medição. */
async function openTour() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  mockPathname.value = '/feed';
  mockAuth.user = { id: 'u1' };
  mockAuth.loading = false;
  window.innerWidth = 390;
  window.innerHeight = 844;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('AppTour', () => {
  it('abre sozinho na primeira vez e mostra o primeiro passo', async () => {
    mountNav();
    render(<AppTour />);
    expect(screen.queryByRole('dialog')).toBeNull();

    await openTour();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeTruthy();
  });

  it('avança clicando no balão e destaca Início antes de Mensagens', async () => {
    mountNav();
    render(<AppTour />);
    await openTour();

    // Passo 1: cartão de boas-vindas. Clicar no balão avança.
    await act(async () => {
      fireEvent.click(screen.getByRole('dialog'));
    });
    expect(screen.getByText(TOUR_STEPS[1].title)).toBeTruthy(); // Início

    await act(async () => {
      fireEvent.click(screen.getByRole('dialog'));
    });
    expect(screen.getByText(TOUR_STEPS[2].title)).toBeTruthy(); // Mensagens
  });

  it('o botão "Sair do tutorial" fecha e marca como visto', async () => {
    mountNav();
    const { unmount } = render(<AppTour />);
    await openTour();

    await act(async () => {
      fireEvent.click(screen.getByText('Sair do tutorial'));
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Nova montagem (= app reaberto) não mostra o tour de novo.
    unmount();
    render(<AppTour />);
    await openTour();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('chegando ao fim, fecha e não reabre no próximo boot', async () => {
    mountNav();
    const { unmount } = render(<AppTour />);
    await openTour();

    for (let i = 0; i < TOUR_STEPS.length; i++) {
      const dialog = screen.queryByRole('dialog');
      if (!dialog) break;
      await act(async () => {
        fireEvent.click(dialog);
      });
    }
    expect(screen.queryByRole('dialog')).toBeNull();

    unmount();
    render(<AppTour />);
    await openTour();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc fecha o tour', async () => {
    mountNav();
    render(<AppTour />);
    await openTour();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('não abre fora do /feed', async () => {
    mockPathname.value = '/loja';
    mountNav();
    render(<AppTour />);
    await openTour();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('não abre pra visitante deslogado', async () => {
    mockAuth.user = null;
    mountNav();
    render(<AppTour />);
    await openTour();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('não abre em tela sem navegação (nenhum alvo pra destacar)', async () => {
    mountNav([]); // nada com data-tour no DOM
    render(<AppTour />);
    await openTour();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pula os passos cujo alvo não está na tela', async () => {
    mountNav(['nav-feed', 'nav-perfil']); // sem TopNav (chat/plano ausentes)
    render(<AppTour />);
    await openTour();

    const titles: string[] = [];
    for (let i = 0; i < TOUR_STEPS.length + 2; i++) {
      const dialog = screen.queryByRole('dialog');
      if (!dialog) break;
      titles.push(screen.getByRole('heading').textContent ?? '');
      await act(async () => {
        fireEvent.click(dialog);
      });
    }

    const byId = Object.fromEntries(TOUR_STEPS.map((s) => [s.id, s.title]));
    expect(titles).toContain(byId.feed);
    expect(titles).toContain(byId.perfil);
    expect(titles).not.toContain(byId.chat);
    expect(titles).not.toContain(byId.loja);
  });
});
