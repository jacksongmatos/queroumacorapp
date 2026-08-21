// Testes do tour guiado. Cobrem só as partes puras (roteiro + geometria) —
// vitest roda em `environment: 'node'`, então o componente <AppTour> não é
// montado aqui.

import { describe, it, expect } from 'vitest';
import { TOUR_STEPS, resolveVisibleSteps } from '@/lib/tour/steps';
import {
  computeBalloon,
  computeSpotlight,
  sameRect,
  BALLOON_MAX_WIDTH,
  SCREEN_MARGIN,
  SPOT_PADDING,
} from '@/lib/tour/position';

const VIEWPORT = { width: 390, height: 844 }; // iPhone 14

describe('TOUR_STEPS', () => {
  it('abre e fecha com cartões centralizados (sem alvo)', () => {
    expect(TOUR_STEPS[0].selector).toBeNull();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].selector).toBeNull();
  });

  it('destaca Início antes de Mensagens (ordem pedida)', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(ids.indexOf('feed')).toBeGreaterThan(-1);
    expect(ids.indexOf('feed')).toBeLessThan(ids.indexOf('chat'));
  });

  it('não tem ids duplicados e todo passo tem título e texto', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('aponta apenas para seletores data-tour existentes na navegação', () => {
    const known = new Set([
      '[data-tour="nav-feed"]',
      '[data-tour="nav-chat"]',
      '[data-tour="nav-search"]',
      '[data-tour="nav-loja"]',
      '[data-tour="nav-notif"]',
      '[data-tour="nav-perfil"]',
      '[data-tour="nav-plano"]',
    ]);
    for (const s of TOUR_STEPS) {
      if (s.selector !== null) expect(known.has(s.selector)).toBe(true);
    }
  });
});

describe('resolveVisibleSteps', () => {
  it('pula passos cujo alvo não está na tela, mantendo os centralizados', () => {
    // Simula a tela de conversa: sem TopNav (chat/plano somem).
    const missing = new Set(['[data-tour="nav-chat"]', '[data-tour="nav-plano"]']);
    const visible = resolveVisibleSteps(TOUR_STEPS, (sel) => !missing.has(sel));
    const ids = visible.map((s) => s.id);
    expect(ids).not.toContain('chat');
    expect(ids).not.toContain('plano');
    expect(ids).toContain('welcome');
    expect(ids).toContain('feed');
    expect(ids).toContain('done');
  });

  it('sem nenhum alvo, sobram só os cartões centralizados', () => {
    const visible = resolveVisibleSteps(TOUR_STEPS, () => false);
    expect(visible.every((s) => s.selector === null)).toBe(true);
    expect(visible).toHaveLength(2);
  });
});

describe('computeSpotlight', () => {
  it('adiciona folga em volta do alvo', () => {
    const spot = computeSpotlight({ top: 100, left: 40, width: 48, height: 48 }, VIEWPORT);
    expect(spot.top).toBe(100 - SPOT_PADDING);
    expect(spot.left).toBe(40 - SPOT_PADDING);
    expect(spot.width).toBe(48 + SPOT_PADDING * 2);
    expect(spot.height).toBe(48 + SPOT_PADDING * 2);
  });

  it('sem alvo, colapsa num ponto no centro (tela toda escura)', () => {
    const spot = computeSpotlight(null, VIEWPORT);
    expect(spot.width).toBe(0);
    expect(spot.height).toBe(0);
    expect(spot.left).toBe(VIEWPORT.width / 2);
    expect(spot.top).toBe(VIEWPORT.height / 2);
  });
});

describe('computeBalloon', () => {
  it('põe o balão ACIMA de alvo na metade de baixo (BottomNav)', () => {
    const b = computeBalloon({ top: 790, left: 20, width: 48, height: 48 }, VIEWPORT);
    expect(b.side).toBe('top');
    expect(b.top).toBeLessThan(790);
  });

  it('põe o balão ABAIXO de alvo na metade de cima (TopNav)', () => {
    const b = computeBalloon({ top: 12, left: 320, width: 44, height: 44 }, VIEWPORT);
    expect(b.side).toBe('bottom');
    expect(b.top).toBeGreaterThan(12 + 44);
  });

  it('centraliza e dispensa a setinha quando não há alvo', () => {
    const b = computeBalloon(null, VIEWPORT);
    expect(b.side).toBe('center');
    expect(b.arrowLeft).toBeNull();
    expect(b.left).toBeCloseTo((VIEWPORT.width - b.width) / 2, 5);
  });

  it('nunca vaza da tela, mesmo com alvo colado no canto', () => {
    for (const rect of [
      { top: 790, left: 0, width: 48, height: 48 }, // canto esquerdo
      { top: 790, left: 342, width: 48, height: 48 }, // canto direito
    ]) {
      const b = computeBalloon(rect, VIEWPORT);
      expect(b.left).toBeGreaterThanOrEqual(SCREEN_MARGIN);
      expect(b.left + b.width).toBeLessThanOrEqual(VIEWPORT.width - SCREEN_MARGIN + 0.001);
    }
  });

  it('a setinha continua apontando pro alvo depois do clamp lateral', () => {
    const rect = { top: 790, left: 0, width: 48, height: 48 };
    const b = computeBalloon(rect, VIEWPORT);
    const targetCenterX = rect.left + rect.width / 2;
    // Setinha (em coordenada de tela) fica em cima do centro do botão, ou o
    // mais perto possível respeitando o recuo mínimo do canto do balão.
    const arrowScreenX = b.left + (b.arrowLeft ?? 0);
    expect(Math.abs(arrowScreenX - targetCenterX)).toBeLessThanOrEqual(SCREEN_MARGIN + 22);
    expect(b.arrowLeft).toBeGreaterThan(0);
    expect(b.arrowLeft).toBeLessThan(b.width);
  });

  it('limita a largura em telas estreitas e no máximo do balão', () => {
    expect(computeBalloon(null, { width: 280, height: 600 }).width).toBe(280 - SCREEN_MARGIN * 2);
    expect(computeBalloon(null, { width: 1200, height: 900 }).width).toBe(BALLOON_MAX_WIDTH);
  });
});

describe('sameRect', () => {
  it('ignora diferença de sub-pixel (evita re-render à toa)', () => {
    const a = { top: 10, left: 10, width: 40, height: 40 };
    expect(sameRect(a, { ...a, top: 10.2 })).toBe(true);
    expect(sameRect(a, { ...a, top: 12 })).toBe(false);
  });

  it('trata null como estado próprio', () => {
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(null, { top: 0, left: 0, width: 1, height: 1 })).toBe(false);
  });
});
