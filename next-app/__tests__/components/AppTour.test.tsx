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
import { TOUR_STEPS, PROFILE_TOUR_STEPS } from '@/lib/tour/steps';
import { startTour } from '@/lib/tour/storage';

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

// ─────────────────────────────────────────────────────────────────────────────
// Tour 2 — ferramentas do perfil. Mesmo componente, outra flag/rota/roteiro.

/** Monta tiles falsos com rect não-nulo, imitando o BusinessGrid. */
function mountTiles(sheets: string[]) {
  for (const [i, sheet] of sheets.entries()) {
    const el = document.createElement('button');
    el.setAttribute('data-tour', `tile-${sheet}`);
    el.getBoundingClientRect = () =>
      ({ top: 200 + i * 100, left: 12, width: 110, height: 92, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    // jsdom não implementa scrollIntoView.
    el.scrollIntoView = () => {};
    document.body.appendChild(el);
  }
}

const PAINTER_TILES = ['pedidos', 'orcamento', 'pontos', 'seu-ze'];

function renderProfileTour() {
  return render(
    <AppTour tour="profile" steps={PROFILE_TOUR_STEPS} autoPath="/perfil" />,
  );
}

function stepTitle(id: string): string {
  const step = PROFILE_TOUR_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`passo ${id} não existe`);
  return step.title;
}

describe('AppTour — ferramentas do perfil', () => {
  beforeEach(() => {
    mockPathname.value = '/perfil';
  });

  it('abre sozinho na primeira visita ao /perfil', async () => {
    mountTiles(PAINTER_TILES);
    renderProfileTour();
    await openTour();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(stepTitle('p-welcome'))).toBeTruthy();
  });

  it('explica um tile por passo, na ordem do grid', async () => {
    mountTiles(PAINTER_TILES);
    renderProfileTour();
    await openTour();

    const titles: string[] = [];
    for (let i = 0; i < PROFILE_TOUR_STEPS.length + 2; i++) {
      const dialog = screen.queryByRole('dialog');
      if (!dialog) break;
      titles.push(screen.getByRole('heading').textContent ?? '');
      await act(async () => {
        fireEvent.click(dialog);
      });
    }

    expect(titles).toEqual([
      stepTitle('p-welcome'),
      stepTitle('p-pedidos'),
      stepTitle('p-orcamento'),
      stepTitle('p-pontos'),
      stepTitle('p-seu-ze'),
      stepTitle('p-done'),
    ]);
  });

  it('pula os tiles que o papel do usuário não tem', async () => {
    mountTiles(['grafites', 'arte-venda', 'fe']); // grafiteiro
    renderProfileTour();
    await openTour();

    const titles: string[] = [];
    for (let i = 0; i < PROFILE_TOUR_STEPS.length + 2; i++) {
      const dialog = screen.queryByRole('dialog');
      if (!dialog) break;
      titles.push(screen.getByRole('heading').textContent ?? '');
      await act(async () => {
        fireEvent.click(dialog);
      });
    }

    expect(titles).toContain(stepTitle('p-grafites'));
    expect(titles).toContain(stepTitle('p-fe'));
    expect(titles).not.toContain(stepTitle('p-seu-ze'));
    expect(titles).not.toContain(stepTitle('p-financeiro'));
  });

  it('rola até o tile que está fora da dobra antes de destacar', async () => {
    // 1º tile visível (top 200), 2º lá embaixo (top 2000, viewport 844).
    mountTiles(['pedidos', 'orcamento']);
    const tiles = Array.from(document.querySelectorAll('[data-tour]')) as HTMLElement[];
    tiles[1].getBoundingClientRect = () =>
      ({ top: 2000, left: 12, width: 110, height: 92, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    const scrolled: string[] = [];
    for (const el of tiles) {
      el.scrollIntoView = () => {
        scrolled.push(el.getAttribute('data-tour') ?? '');
      };
    }

    renderProfileTour();
    await openTour();
    expect(scrolled).toEqual([]); // boas-vindas: sem alvo, sem scroll

    await act(async () => {
      fireEvent.click(screen.getByRole('dialog')); // → tile-pedidos (na dobra)
    });
    expect(scrolled).toEqual([]);

    await act(async () => {
      fireEvent.click(screen.getByRole('dialog')); // → tile-orcamento (fora)
    });
    expect(scrolled).toEqual(['tile-orcamento']);
  });

  it('mostra "N de M" em vez de bolinhas quando o tour é comprido', async () => {
    // 12 tiles + boas-vindas + fim = 14 passos → passa do limite das bolinhas.
    mountTiles([
      'pedidos', 'orcamento', 'orcamentos', 'pontos', 'portfolio', 'calculadora',
      'agenda', 'crm', 'financeiro', 'notes', 'arte-ig', 'camisetas',
    ]);
    renderProfileTour();
    await openTour();

    expect(screen.getByText('1 de 14')).toBeTruthy();
  });

  it('tem flag própria: ter visto o tour da navegação não pula o do perfil', async () => {
    window.localStorage.setItem('app_tour_seen_v1', '1');
    mountTiles(PAINTER_TILES);
    renderProfileTour();
    await openTour();

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('não reabre depois de terminado, e o botão do perfil reabre', async () => {
    mountTiles(PAINTER_TILES);
    const { unmount } = renderProfileTour();
    await openTour();
    await act(async () => {
      fireEvent.click(screen.getByText('Sair do tutorial'));
    });

    unmount();
    renderProfileTour();
    await openTour();
    expect(screen.queryByRole('dialog')).toBeNull();

    // "Ver tutorial das ferramentas" → startTour('profile')
    await act(async () => {
      startTour('profile');
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('startTour("nav") não abre o tour do perfil (e vice-versa)', async () => {
    mountNav();
    mountTiles(PAINTER_TILES);
    window.localStorage.setItem('profile_tour_seen_v1', '1');
    renderProfileTour();
    await openTour();
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      startTour('nav');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
