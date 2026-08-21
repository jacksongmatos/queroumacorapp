// storage.ts — flag "já vi o tour" + canal pra reabrir o tour de qualquer
// lugar do app (botão "Ver tutorial de novo" no perfil).
//
// Mesma defensividade do resto do app: todo acesso a localStorage passa por
// try/catch porque Safari anônimo e iframes com storage bloqueado lançam
// SecurityError. Sem storage o tour reaparece no próximo boot — chato, mas
// muito melhor do que quebrar a tela.

const KEY = 'app_tour_seen_v1';

/** Evento interno que manda o <AppTour> abrir do zero. */
export const TOUR_START_EVENT = 'queroumacor:start-tour';

export function hasSeenTour(): boolean {
  try {
    if (typeof window === 'undefined') return true; // SSR: nunca auto-abre
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, '1');
  } catch {
    // silencioso — ver comentário do topo.
  }
}

/** Reabre o tour agora (e limpa a flag, pra ficar consistente se recarregar). */
export function startTour(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOUR_START_EVENT));
  }
}
