// AppTour — tour guiado (coach marks) que roda UMA vez, na primeira abertura
// do app. Escurece a tela, abre um "buraco" de luz em cima de um botão real
// da navegação e mostra um balão com uma frase curta explicando pra que ele
// serve. Tocar em qualquer lugar (ou no balão) avança pro próximo passo.
//
// Como funciona:
//   - Os alvos são marcados com `data-tour="nav-*"` no TopNav/BottomNav; o
//     roteiro vive em `lib/tour/steps.ts` e a geometria em `lib/tour/position.ts`.
//   - O holofote é uma <div> vazia com `box-shadow: 0 0 0 9999px preto`: o
//     miolo fica transparente (o botão aparece), o resto da tela escurece.
//     Animar top/left/width/height dessa div faz a luz "voar" de um botão
//     pro outro — é daí que vem a animação.
//   - Um catch-all transparente por baixo do holofote come todos os cliques,
//     então nada do app é acionado por engano durante o tour.
//   - Passos sem alvo (boas-vindas / fim) usam um recorte de área zero no
//     centro: tela toda escura e cartão centralizado.
//
// O componente é reaproveitado por DOIS tours (props `tour`/`steps`/`autoPath`):
//   - navegação: auto-abre em `/feed`, flag `app_tour_seen_v1` (default);
//   - ferramentas do perfil: auto-abre em `/perfil`, flag `profile_tour_seen_v1`,
//     montado dentro do <BusinessGrid> (é onde os tiles vivem).
//
// Auto-abre só na rota do tour, só pra usuário logado e só se a flag não
// estiver no localStorage. Pular ou terminar grava a flag. `startTour(id)`
// (botões no perfil) reabre quando o usuário quiser.
//
// Tour com alvo fora da tela (o grid do perfil é comprido e rola): antes de
// mostrar o balão o passo puxa o alvo pro meio da viewport com
// `scrollIntoView`. Por isso o scroll do usuário é travado por
// `preventDefault` no overlay em vez de `overflow:hidden` no body — com o
// body travado o scroll programático também morreria.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { TOUR_STEPS, resolveVisibleSteps, type TourStep } from '@/lib/tour/steps';
import {
  computeBalloon,
  computeSpotlight,
  sameRect,
  type Rect,
} from '@/lib/tour/position';
import {
  hasSeenTour,
  markTourSeen,
  tourFromEvent,
  TOUR_START_EVENT,
  type TourId,
} from '@/lib/tour/storage';

/** Escuridão do overlay. Alto o bastante pra focar, baixo pra manter contexto. */
const DIM = 0.74;
/** Intervalo de re-medição do alvo (barra fixa quase não se move). */
const MEASURE_MS = 250;
/** Espera depois do login/mount pra layout assentar antes de abrir. */
const AUTOSTART_DELAY_MS = 800;
/** Acima de N passos as bolinhas de progresso viram barra + "3 de 21". */
const DOTS_MAX_STEPS = 10;
/** Respiro mínimo do alvo até a borda da tela antes de rolar até ele. */
const SCROLL_MARGIN = 120;

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  if (b.width === 0 && b.height === 0) return null;
  return { top: b.top, left: b.left, width: b.width, height: b.height };
}

export interface AppTourProps {
  /** Qual tour este componente representa (flag + evento de reabertura). */
  tour?: TourId;
  /** Roteiro. Default: os botões da navegação. */
  steps?: ReadonlyArray<TourStep>;
  /** Rota onde ele pode se auto-abrir na primeira vez. */
  autoPath?: string;
}

export function AppTour({
  tour = 'nav',
  steps: script = TOUR_STEPS,
  autoPath = '/feed',
}: AppTourProps = {}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);

  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const autoStarted = useRef(false);

  const active = steps !== null;
  const step = steps?.[index] ?? null;

  // ── abrir / fechar ────────────────────────────────────────────────────────

  const open = useCallback(() => {
    const visible = resolveVisibleSteps(script, (sel) => measure(sel) !== null);
    // Só dois cartões centralizados e nenhum botão pra destacar (tela sem
    // navegação): não vale a pena abrir.
    if (visible.filter((s) => s.selector !== null).length === 0) return;
    setIndex(0);
    setRect(null);
    setSteps(visible);
  }, [script]);

  const close = useCallback(() => {
    markTourSeen(tour);
    setSteps(null);
    setIndex(0);
    setRect(null);
  }, [tour]);

  const next = useCallback(() => {
    if (!steps) return;
    if (index + 1 >= steps.length) {
      close();
      return;
    }
    setIndex(index + 1);
  }, [steps, index, close]);

  // Auto-abertura: só na home do app logado, só uma vez por dispositivo.
  useEffect(() => {
    if (autoStarted.current || active) return;
    if (loading || !user) return;
    if (pathname !== autoPath) return;
    if (hasSeenTour(tour)) return;
    autoStarted.current = true;
    const t = setTimeout(open, AUTOSTART_DELAY_MS);
    return () => clearTimeout(t);
  }, [active, loading, user, pathname, autoPath, tour, open]);

  // Reabertura manual (botão "Ver tutorial de novo" no perfil).
  useEffect(() => {
    const onStart = (event: Event) => {
      if (tourFromEvent(event) !== tour) return;
      autoStarted.current = true;
      open();
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, [open, tour]);

  // ── medição do alvo + viewport ────────────────────────────────────────────

  useEffect(() => {
    if (!active) return;

    const sync = () => {
      setViewport((v) =>
        v.width === window.innerWidth && v.height === window.innerHeight
          ? v
          : { width: window.innerWidth, height: window.innerHeight },
      );
      const found = step?.selector ? measure(step.selector) : null;
      setRect((prev) => (sameRect(prev, found) ? prev : found));
    };

    sync();
    const id = window.setInterval(sync, MEASURE_MS);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [active, step]);

  // Respeita "reduzir animação" do sistema — sem transições nem pulso.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Esc fecha; setas/Enter avançam via foco no botão primário.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close, next]);

  // Foco no botão primário a cada passo (leitor de tela lê o balão novo).
  useEffect(() => {
    if (active) primaryBtnRef.current?.focus();
  }, [active, index]);

  // Trava o scroll DO USUÁRIO enquanto o tour está aberto — sem congelar o
  // documento. `overflow:hidden` no body também mataria o `scrollIntoView`
  // que o passo usa pra puxar tile fora da dobra; comendo o gesto (touch e
  // roda do mouse) o efeito visual é o mesmo e o scroll programático segue
  // funcionando.
  useEffect(() => {
    if (!active) return;
    const block = (e: Event) => e.preventDefault();
    const opts: AddEventListenerOptions = { passive: false };
    document.addEventListener('touchmove', block, opts);
    document.addEventListener('wheel', block, opts);
    return () => {
      document.removeEventListener('touchmove', block, opts);
      document.removeEventListener('wheel', block, opts);
    };
  }, [active]);

  // Alvo fora da dobra (grid de ferramentas do perfil rola muito): traz o
  // tile pro meio da tela antes de acender o holofote. Só rola quando o alvo
  // está mesmo perto da borda, pra não sacudir a tela à toa.
  useEffect(() => {
    if (!active || !step?.selector) return;
    const el = document.querySelector(step.selector);
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const b = el.getBoundingClientRect();
    const tooHigh = b.top < SCROLL_MARGIN;
    const tooLow = b.top + b.height > window.innerHeight - SCROLL_MARGIN;
    if (!tooHigh && !tooLow) return;
    el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [active, step, reduceMotion]);

  const spot = useMemo(() => computeSpotlight(rect, viewport), [rect, viewport]);
  const balloon = useMemo(() => computeBalloon(rect, viewport), [rect, viewport]);

  if (!steps || !step || viewport.width === 0) return null;

  const isLast = index === steps.length - 1;
  const ease = 'cubic-bezier(.4,0,.2,1)';
  const spotTransition = reduceMotion
    ? 'none'
    : `top .45s ${ease}, left .45s ${ease}, width .45s ${ease}, height .45s ${ease}, border-radius .45s ${ease}`;

  return (
    <div className="tour-root">
      {/* Come todos os cliques: avança o passo e impede que o toque chegue
          no app por baixo. Fica ABAIXO do holofote (que é pointer-events:none). */}
      <div
        className="fixed inset-0 z-[1000]"
        onClick={next}
        aria-hidden="true"
        style={{ cursor: 'pointer' }}
      />

      {/* Holofote: miolo transparente + sombra gigante escurecendo o resto. */}
      <div
        className="fixed z-[1001] pointer-events-none"
        aria-hidden="true"
        style={{
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
          borderRadius: rect ? (step.radius ?? 16) : 0,
          boxShadow: rect
            ? `0 0 0 3px var(--color-p1), 0 0 24px 6px rgba(255,107,53,.45), 0 0 0 9999px rgba(0,0,0,${DIM})`
            : `0 0 0 9999px rgba(0,0,0,${DIM})`,
          transition: spotTransition,
        }}
      >
        {rect && !reduceMotion && <span className="tour-ring" />}
      </div>

      {/* Balão. O bloco inteiro é clicável pra avançar (pedido do usuário);
          os botões internos usam stopPropagation pra não disparar duas vezes. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        onClick={next}
        className={`fixed z-[1002] rounded-2xl shadow-2xl text-left ${reduceMotion ? '' : 'tour-balloon-fade'}`}
        key={step.id}
        style={{
          width: balloon.width,
          left: balloon.left,
          top: balloon.top,
          transform:
            balloon.side === 'top'
              ? 'translateY(-100%)'
              : balloon.side === 'center'
                ? 'translateY(-50%)'
                : undefined,
          background: 'var(--color-white)',
          border: '1px solid var(--color-border)',
          padding: '16px 16px 14px',
          cursor: 'pointer',
        }}
      >
        {/* Setinha apontando pro botão destacado. */}
        {balloon.arrowLeft !== null && (
          <span
            aria-hidden="true"
            className="absolute w-3.5 h-3.5 rotate-45"
            style={{
              left: balloon.arrowLeft - 7,
              top: balloon.side === 'bottom' ? -8 : undefined,
              bottom: balloon.side === 'top' ? -8 : undefined,
              background: 'var(--color-white)',
              // Só as duas bordas "de fora" do losango, pra emendar com a
              // borda do balão sem riscar por dentro dele.
              borderRight: balloon.side === 'top' ? '1px solid var(--color-border)' : undefined,
              borderBottom: balloon.side === 'top' ? '1px solid var(--color-border)' : undefined,
              borderLeft: balloon.side === 'bottom' ? '1px solid var(--color-border)' : undefined,
              borderTop: balloon.side === 'bottom' ? '1px solid var(--color-border)' : undefined,
            }}
          />
        )}

        {/* Wrapper interno: leva a animação de escala/slide, deixando o
            `transform` de ancoragem do balão externo intacto. */}
        <div className={reduceMotion ? undefined : 'tour-balloon-in'}>
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none shrink-0" aria-hidden="true">
            {step.emoji}
          </span>
          <div className="min-w-0">
            <h2
              id="tour-title"
              className="text-base font-extrabold text-[color:var(--color-ink)] leading-snug"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {step.title}
            </h2>
            <p
              id="tour-text"
              className="mt-1 text-sm text-[color:var(--color-muted)] leading-relaxed"
            >
              {step.text}
            </p>
          </div>
        </div>

        {/* Progresso. Tour curto (navegação) = bolinhas. Tour comprido (uma
            ferramenta por passo) = barra + "3 de 21", porque 20 bolinhas não
            cabem no balão e viram poeira visual. O texto "N de M" também vai
            no aria-label do botão primário nos dois casos. */}
        {steps.length <= DOTS_MAX_STEPS ? (
          <div className="flex justify-center gap-1.5 mt-4 mb-3" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === index ? 18 : 6,
                  background: i === index ? 'var(--color-p1)' : 'var(--color-border)',
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-4 mb-3" aria-hidden="true">
            <div
              className="h-1.5 rounded-full flex-1 overflow-hidden"
              style={{ background: 'var(--color-border)' }}
            >
              <span
                className="block h-full rounded-full transition-all duration-300"
                style={{
                  width: `${((index + 1) / steps.length) * 100}%`,
                  background: 'var(--color-p1)',
                }}
              />
            </div>
            <span className="text-[11px] font-semibold text-[color:var(--color-muted)] tabular-nums shrink-0">
              {index + 1} de {steps.length}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="px-2 py-2 text-xs font-semibold text-[color:var(--color-muted)] underline underline-offset-2"
          >
            Sair do tutorial
          </button>

          <button
            ref={primaryBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label={
              isLast
                ? 'Terminar o tutorial'
                : `Próximo passo (${index + 1} de ${steps.length})`
            }
            className="px-5 py-2.5 text-white text-sm font-extrabold rounded-xl active:scale-95 transition-transform"
            style={{ background: 'var(--color-p1)', fontFamily: 'var(--font-display)' }}
          >
            {isLast ? 'Começar a usar' : 'Próximo'}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
