// @vitest-environment jsdom
//
// Aviso das Cores do Ano na Loja (06/09/2026). O contrato inteiro do
// componente é "aparece UMA vez": um modal promocional que reaparece a cada
// visita é o tipo de coisa que a pessoa aprende a fechar sem ler.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { CorDoAnoModal } from '@/app/loja/CorDoAnoModal';
import {
  CORES_DO_ANO,
  ANO_DAS_CORES,
  textoSobre,
  jaViuCoresDoAno,
  _resetCoresDoAnoParaTeste,
} from '@/lib/coresDoAno';

function abrir() {
  const r = render(<CorDoAnoModal />);
  act(() => {
    vi.advanceTimersByTime(600);
  });
  return r;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  _resetCoresDoAnoParaTeste();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CorDoAnoModal', () => {
  it('abre na primeira visita e mostra nome, código e quadro de cada cor', () => {
    const { container } = abrir();

    expect(screen.getByRole('dialog')).toBeTruthy();
    for (const cor of CORES_DO_ANO) {
      expect(screen.getByText(cor.nome)).toBeTruthy();
      expect(screen.getByText(new RegExp(cor.codigo))).toBeTruthy();
    }
    // Um quadrinho por cor (+ a faixa do topo, que é decorativa). O jsdom
    // normaliza o hex pra `rgb(...)`, então a comparação é pelo rgb.
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const quadros = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
      (d) => CORES_DO_ANO.some((c) => d.style.background === rgb(c.hex)),
    );
    expect(quadros.length).toBeGreaterThanOrEqual(CORES_DO_ANO.length);
    expect(screen.getByText(String(ANO_DAS_CORES))).toBeTruthy();
  });

  it('"Entendi" fecha e o modal NÃO volta na visita seguinte', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(jaViuCoresDoAno()).toBe(true);

    cleanup();
    abrir(); // segunda visita à Loja
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('não reabre nem depois de recarregar o app (a marca vive no storage)', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    cleanup();

    // Recarregar zera a memória do módulo, mas não o localStorage.
    _resetCoresDoAnoParaTeste();
    abrir();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fechar pelo fundo ou pelo Esc também conta como visto', () => {
    const { container } = abrir();
    fireEvent.click(container.querySelector('[role="presentation"]')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(jaViuCoresDoAno()).toBe(true);

    cleanup();
    _resetCoresDoAnoParaTeste();
    window.localStorage.clear();
    abrir();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(jaViuCoresDoAno()).toBe(true);
  });

  it('com o localStorage bloqueado, não repete dentro da mesma sessão', () => {
    const real = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('storage bloqueado');
    };
    try {
      abrir();
      fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
      cleanup();
      abrir();
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      window.localStorage.setItem = real;
    }
  });
});

describe('textoSobre', () => {
  it('escolhe claro no verde escuro e escuro nos tons claros', () => {
    // Os três tons de 2026 são médios: chutar pelo olho erra justamente aqui.
    expect(textoSobre('#767745')).toBe('#ffffff'); // Cipó da Amazônia
    expect(textoSobre('#b8a992')).toBe('#1a1a2e'); // Universal Khaki
    expect(textoSobre('#c0afad')).toBe('#1a1a2e'); // Tempestade
  });

  it('cai no escuro quando o valor não é um hex de 6 dígitos', () => {
    expect(textoSobre('nada')).toBe('#1a1a2e');
  });
});
