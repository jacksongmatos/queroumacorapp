// position.ts — geometria pura do tour guiado. Fica separado do componente
// pra poder ser testado sem DOM (vitest roda em `environment: 'node'`).
//
// Duas contas:
//   1. `computeSpotlight` — o retângulo do "buraco" no overlay escuro.
//   2. `computeBalloon`   — onde o balão fica e pra onde a setinha aponta.
//
// O balão é posicionado SEM saber a própria altura: quando fica acima do
// alvo, ancoramos em `top` e o componente aplica `translateY(-100%)`. Isso
// evita render em duas passadas (medir → reposicionar → piscar).

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Folga entre a borda do alvo e o recorte do holofote. */
export const SPOT_PADDING = 8;
/** Distância entre o alvo e o balão. */
export const BALLOON_GAP = 14;
/** Respiro mínimo entre o balão e a borda da tela. */
export const SCREEN_MARGIN = 12;
/** Largura máxima do balão (o app tem max-width 430px). */
export const BALLOON_MAX_WIDTH = 320;
/** Distância mínima da setinha até o canto do balão. */
const ARROW_INSET = 22;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Recorte do holofote. `null` (passo sem alvo) devolve um ponto de área
 * zero no centro da tela: o overlay fica totalmente escuro e a transição
 * entre "cartão centralizado" e "botão destacado" continua animada.
 */
export function computeSpotlight(rect: Rect | null, viewport: Viewport): Rect {
  if (!rect) {
    return { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 };
  }
  const top = rect.top - SPOT_PADDING;
  const left = rect.left - SPOT_PADDING;
  return {
    top,
    left,
    width: Math.max(0, rect.width + SPOT_PADDING * 2),
    height: Math.max(0, rect.height + SPOT_PADDING * 2),
  };
}

export type BalloonSide = 'top' | 'bottom' | 'center';

export interface BalloonPlacement {
  side: BalloonSide;
  /** Largura efetiva do balão em px. */
  width: number;
  /** `left` em px a partir da borda esquerda da viewport. */
  left: number;
  /** `top` em px. Em `side: 'top'` o componente aplica translateY(-100%). */
  top: number;
  /** Posição horizontal da setinha, relativa ao balão. `null` = sem setinha. */
  arrowLeft: number | null;
}

/**
 * Decide lado, posição e setinha do balão.
 *
 * - Sem alvo → cartão centralizado, sem setinha.
 * - Alvo na metade de baixo da tela (BottomNav) → balão ACIMA dele.
 * - Alvo na metade de cima (TopNav) → balão ABAIXO dele.
 *
 * O `left` é grudado no centro do alvo e depois clampado nas bordas; a
 * setinha compensa o clamp pra continuar apontando pro botão certo.
 */
export function computeBalloon(rect: Rect | null, viewport: Viewport): BalloonPlacement {
  const width = Math.min(BALLOON_MAX_WIDTH, Math.max(0, viewport.width - SCREEN_MARGIN * 2));

  if (!rect) {
    return {
      side: 'center',
      width,
      left: Math.max(SCREEN_MARGIN, (viewport.width - width) / 2),
      top: viewport.height / 2,
      arrowLeft: null,
    };
  }

  const targetCenterX = rect.left + rect.width / 2;
  const above = rect.top + rect.height / 2 > viewport.height / 2;

  const maxLeft = Math.max(SCREEN_MARGIN, viewport.width - width - SCREEN_MARGIN);
  const left = clamp(targetCenterX - width / 2, SCREEN_MARGIN, maxLeft);

  const top = above
    ? rect.top - SPOT_PADDING - BALLOON_GAP
    : rect.top + rect.height + SPOT_PADDING + BALLOON_GAP;

  const arrowLeft = clamp(
    targetCenterX - left,
    Math.min(ARROW_INSET, width / 2),
    Math.max(ARROW_INSET, width - ARROW_INSET),
  );

  return { side: above ? 'top' : 'bottom', width, left, top, arrowLeft };
}

/**
 * Compara dois retângulos com tolerância de sub-pixel. Usado pra evitar
 * `setState` (e re-render) a cada tick de medição quando nada mudou.
 */
export function sameRect(a: Rect | null, b: Rect | null, epsilon = 0.5): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < epsilon &&
    Math.abs(a.left - b.left) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}
