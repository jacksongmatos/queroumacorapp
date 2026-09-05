// ClickRuaView — banca da revista Click Rua dentro do app: um card por
// edição, e a edição pronta abre num leitor de tela cheia.
//
// Duas decisões que valem registro:
//
//  1. O LEITOR É TELA CHEIA, NÃO CONTINUA NO BOTTOM-SHEET. A página é
//     quadrada e cheia de texto; dentro do sheet ela nasceria com metade da
//     largura útil e ninguém leria. O leitor é portal no <body> com z-[400],
//     mesmo tratamento do StoryViewer — e pela mesma razão: a BottomNav é
//     z-[300] e cobriria o topo.
//
//  2. TEM ZOOM PORQUE A REVISTA TEM LETRA MIÚDA. Página de entrevista com
//     texto corrido a 1483px encolhida pra 390px de celular é ilegível.
//     Toque duplo alterna 1x/2,5x e, com zoom, o dedo arrasta a página.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CLICK_RUA_TAG,
  EDICOES,
  paginasDe,
  rotuloEdicao,
  type Edicao,
  type EdicaoPronta,
} from '@/lib/clickRua';

export function ClickRuaView() {
  const [lendo, setLendo] = useState<EdicaoPronta | null>(null);

  return (
    <div className="px-3.5 pt-4 pb-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/click-rua/logo.webp"
        alt="Click Rua"
        width={600}
        height={295}
        style={{ width: '100%', maxWidth: 260, height: 'auto', display: 'block' }}
      />
      <p style={{ fontSize: 13, color: 'var(--color-ink)', marginTop: 10, lineHeight: 1.5 }}>
        Revista digital de graffiti do Brasil inteiro — onde quem faz é você.
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16 }}>
        {CLICK_RUA_TAG}
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        {EDICOES.map((ed) => (
          <CardEdicao
            key={ed.numero}
            edicao={ed}
            onAbrir={() => ed.status === 'pronta' && setLendo(ed)}
          />
        ))}
      </div>

      {lendo ? <Leitor edicao={lendo} onFechar={() => setLendo(null)} /> : null}
    </div>
  );
}

function CardEdicao({ edicao, onAbrir }: { edicao: Edicao; onAbrir: () => void }) {
  const pronta = edicao.status === 'pronta';

  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={!pronta}
      aria-label={
        pronta ? `Ler ${rotuloEdicao(edicao.numero)}` : `${rotuloEdicao(edicao.numero)} em breve`
      }
      className="text-left"
      style={{
        background: 'var(--color-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        overflow: 'hidden',
        padding: 0,
        cursor: pronta ? 'pointer' : 'default',
        opacity: pronta ? 1 : 0.65,
      }}
    >
      <div style={{ aspectRatio: '1 / 1', background: '#1a1a2e', position: 'relative' }}>
        {pronta ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={edicao.capa}
            alt={`Capa da ${rotuloEdicao(edicao.numero)} da Click Rua`}
            width={560}
            height={560}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            className="flex items-center justify-center h-full"
            style={{
              background: 'linear-gradient(135deg, #ff6b35, #1a1a2e)',
              color: 'rgba(255,255,255,.9)',
              fontFamily: 'var(--font-display)',
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            #{String(edicao.numero).padStart(2, '0')}
          </div>
        )}
      </div>
      <div style={{ padding: '9px 10px 11px' }}>
        <div className="font-bold" style={{ fontSize: 12, color: 'var(--color-ink)' }}>
          {rotuloEdicao(edicao.numero)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2, lineHeight: 1.4 }}>
          {pronta ? `${edicao.quando} · ${edicao.paginas} páginas` : 'Em breve'}
        </div>
        {pronta ? (
          <div
            style={{
              fontSize: 10,
              color: 'var(--color-p1)',
              marginTop: 4,
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          >
            {edicao.destaque}
          </div>
        ) : null}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────

const ZOOM = 2.5;

function Leitor({ edicao, onFechar }: { edicao: EdicaoPronta; onFechar: () => void }) {
  const paginas = paginasDe(edicao);
  const [montado, setMontado] = useState(false);
  const [atual, setAtual] = useState(0);
  const trilhoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMontado(true), []);

  // Botão VOLTAR do Android fecha o leitor em vez de sair da tela. Mesmo
  // mecanismo do StoryViewer: empurra uma entrada no histórico ao abrir, o
  // "voltar" consome ela e o popstate fecha. `onFechar` fica numa ref pra o
  // efeito não rearmar a cada render e empilhar entradas fantasma.
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let consumido = false;
    window.history.pushState({ qucClickRua: true }, '');
    function aoVoltar() {
      consumido = true;
      fecharRef.current();
    }
    window.addEventListener('popstate', aoVoltar);
    return () => {
      window.removeEventListener('popstate', aoVoltar);
      // Fechou pelo X ou pelo Esc: desfaz a entrada, senão o próximo
      // "voltar" não sairia da tela — só apagaria essa sobra.
      if (!consumido) window.history.back();
    };
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') fecharRef.current();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  // Qual página está em cena — lido do scroll do trilho, que é quem manda
  // (o snap é do navegador, não nosso).
  const aoRolar = useCallback(() => {
    const el = trilhoRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setAtual((antes) => (antes === i ? antes : i));
  }, []);

  if (!montado) return null;

  const conteudo = (
    <div
      className="fixed inset-0 z-[400] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`${rotuloEdicao(edicao.numero)} da Click Rua`}
    >
      <div
        ref={trilhoRef}
        onScroll={aoRolar}
        className="flex h-full w-full"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          overscrollBehavior: 'contain',
        }}
      >
        {paginas.map((src, i) => (
          <Pagina key={src} src={src} numero={i + 1} total={paginas.length} />
        ))}
      </div>

      <div
        className="absolute left-0 right-0 flex items-center justify-between px-3"
        style={{ top: 'calc(8px + env(safe-area-inset-top))' }}
      >
        <span
          className="rounded-full font-bold"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: 'rgba(0,0,0,.55)',
            color: '#fff',
          }}
        >
          {atual + 1} / {paginas.length}
        </span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar a revista"
          className="rounded-full flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            background: 'rgba(0,0,0,.55)',
            color: '#fff',
            border: 'none',
            fontSize: 22,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      <p
        className="absolute left-0 right-0 text-center"
        style={{
          bottom: 'calc(10px + env(safe-area-inset-bottom))',
          fontSize: 11,
          color: 'rgba(255,255,255,.6)',
        }}
      >
        Arraste para virar a página · toque duas vezes para aproximar
      </p>
    </div>
  );

  return createPortal(conteudo, document.body);
}

function Pagina({ src, numero, total }: { src: string; numero: number; total: number }) {
  const [zoom, setZoom] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arrasto = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  function aoTocarInicio(e: React.TouchEvent) {
    if (!zoom || e.touches.length !== 1) return;
    const t = e.touches[0]!;
    arrasto.current = { x: t.clientX, y: t.clientY, px: pos.x, py: pos.y };
  }

  function aoTocarMover(e: React.TouchEvent) {
    const a = arrasto.current;
    if (!zoom || !a || e.touches.length !== 1) return;
    const t = e.touches[0]!;
    // Com zoom o dedo move a PÁGINA; sem isto o gesto viraria troca de
    // página e não daria pra ler o canto direito de nada.
    e.stopPropagation();
    setPos({ x: a.px + (t.clientX - a.x), y: a.py + (t.clientY - a.y) });
  }

  function aoTocarFim() {
    arrasto.current = null;
  }

  function alternarZoom() {
    setZoom((z) => {
      if (z) setPos({ x: 0, y: 0 });
      return !z;
    });
  }

  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: '100%',
        height: '100%',
        scrollSnapAlign: 'center',
        scrollSnapStop: 'always',
        // Com zoom, o trilho não pode roubar o gesto de arrastar a página.
        touchAction: zoom ? 'none' : 'pan-x',
        overflow: 'hidden',
      }}
      onTouchStart={aoTocarInicio}
      onTouchMove={aoTocarMover}
      onTouchEnd={aoTocarFim}
      onDoubleClick={alternarZoom}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Página ${numero} de ${total}`}
        width={1483}
        height={1483}
        loading={numero <= 2 ? 'eager' : 'lazy'}
        draggable={false}
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: '100%',
          objectFit: 'contain',
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom ? ZOOM : 1})`,
          transition: arrasto.current ? 'none' : 'transform .18s ease-out',
          userSelect: 'none',
        }}
      />
    </div>
  );
}
