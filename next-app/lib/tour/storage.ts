// storage.ts — flag "já vi o tour" + canal pra reabrir o tour de qualquer
// lugar do app (botões "Ver tutorial de novo" / "Ver tutorial das
// ferramentas" no perfil).
//
// Existem DOIS tours independentes, cada um com a sua própria flag:
//   - 'nav'     → os botões das duas barras (roda na 1ª abertura, em /feed)
//   - 'profile' → os quadradinhos de ferramenta (roda na 1ª vez em /perfil)
//
// Mesma defensividade do resto do app: todo acesso a localStorage passa por
// try/catch porque Safari anônimo e iframes com storage bloqueado lançam
// SecurityError. Sem storage o tour reaparece no próximo boot — chato, mas
// muito melhor do que quebrar a tela.

export type TourId = 'nav' | 'profile';

const KEYS: Record<TourId, string> = {
  nav: 'app_tour_seen_v1',
  profile: 'profile_tour_seen_v1',
};

/** Evento interno que manda um <AppTour> abrir do zero. */
export const TOUR_START_EVENT = 'queroumacor:start-tour';

/** Lê qual tour um evento de start pediu (default 'nav', compat antiga). */
export function tourFromEvent(event: Event): TourId {
  const detail = (event as CustomEvent<{ tour?: TourId }>).detail;
  return detail?.tour ?? 'nav';
}

export function hasSeenTour(tour: TourId = 'nav'): boolean {
  try {
    if (typeof window === 'undefined') return true; // SSR: nunca auto-abre
    return window.localStorage.getItem(KEYS[tour]) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(tour: TourId = 'nav'): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEYS[tour], '1');
  } catch {
    // silencioso — ver comentário do topo.
  }
}

/** Reabre o tour agora (e limpa a flag, pra ficar consistente se recarregar). */
export function startTour(tour: TourId = 'nav'): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(KEYS[tour]);
  } catch {
    // ignora
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOUR_START_EVENT, { detail: { tour } }));
  }
}
