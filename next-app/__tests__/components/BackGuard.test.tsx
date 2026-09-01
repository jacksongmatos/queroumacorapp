// @vitest-environment jsdom
//
// "O voltar nativo fecha o app hoje, e deveria voltar pra tela inicial"
// (01/09/2026). Numa WebView, quem entra direto numa tela — ou volta depois
// que o Android matou o renderizador, que RE-NAVEGA pra URL atual — fica com
// uma entrada só no histórico, e o "voltar" encerra o app do meio de
// qualquer tela.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const replace = vi.fn();
const rota = { atual: '/publicar' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => rota.atual,
}));

import { BackGuard, __resetBackGuardForTests } from '@/components/BackGuard';

function voltar(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
}

beforeEach(() => {
  replace.mockClear();
  rota.atual = '/publicar';
  __resetBackGuardForTests();
  window.history.replaceState(null, '');
});
afterEach(cleanup);

describe('BackGuard — o voltar não fecha o app do meio da navegação', () => {
  it('arma uma entrada-sentinela ao carregar', () => {
    render(<BackGuard />);
    expect((window.history.state as { qucApp?: boolean })?.qucApp).toBe(true);
  });

  it('chegando na base fora do início, volta pro feed em vez de fechar', () => {
    render(<BackGuard />);
    voltar({ qucBase: true });
    expect(replace).toHaveBeenCalledWith('/feed');
    // Repõe a entrada de trabalho — senão o próximo voltar sairia do app.
    expect((window.history.state as { qucApp?: boolean })?.qucApp).toBe(true);
  });

  it('no início NÃO prende a pessoa: o próximo voltar encerra o app', () => {
    rota.atual = '/feed';
    render(<BackGuard />);
    voltar({ qucBase: true });
    expect(replace).not.toHaveBeenCalled();
  });

  it('com histórico do app ainda por consumir, não interfere', () => {
    render(<BackGuard />);
    voltar({ qucApp: true });
    expect(replace).not.toHaveBeenCalled();
  });

  it('remontar (troca de rota) não empilha entradas novas', () => {
    const a = render(<BackGuard />);
    const depoisDoPrimeiro = window.history.length;
    a.unmount();
    render(<BackGuard />);
    expect(window.history.length).toBe(depoisDoPrimeiro);
  });
});
