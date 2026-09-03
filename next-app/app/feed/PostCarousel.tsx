// PostCarousel — as várias fotos de um post, deslizando pro lado.
//
// Motivo (2026-09-01): o composer sempre deixou escolher até 5 fotos e o
// app subia TODAS pro Storage — mas gravava só a primeira no post. As
// outras quatro viravam arquivo órfão, sem ninguém ser avisado. Agora elas
// são guardadas em `posts.media_urls` e aparecem aqui.
//
// Por que scroll-snap em vez de arrastar por JS: o gesto fica com o
// navegador, então herda a inércia, o atrito e o "encaixe" nativos — no
// Android é a diferença entre parecer um app e parecer uma página web. E
// não briga com o scroll vertical do feed, que é o problema clássico de
// carrossel feito na mão.

'use client';

import { useRef, useState, type UIEvent } from 'react';
import { PostMedia } from './PostMedia';

export interface PostCarouselProps {
  urls: string[];
  mediaType?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  muted: boolean;
  onToggleMute: () => void;
}

export function PostCarousel({
  urls,
  mediaType,
  mediaWidth,
  mediaHeight,
  muted,
  onToggleMute,
}: PostCarouselProps) {
  const trilhoRef = useRef<HTMLDivElement | null>(null);
  const [atual, setAtual] = useState(0);

  function aoRolar(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // Índice pela posição: mais confiável que contar eventos de gesto, e
    // funciona igual pra arrasto, teclado e scroll programático.
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== atual && i >= 0 && i < urls.length) setAtual(i);
  }

  function irPara(i: number) {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className="relative w-full">
      <div
        ref={trilhoRef}
        onScroll={aoRolar}
        className="flex w-full overflow-x-auto"
        style={{
          scrollSnapType: 'x mandatory',
          // O feed rola na vertical: sem `contain`, chegar na ponta do
          // carrossel encadearia o gesto no scroller de cima.
          overscrollBehaviorX: 'contain',
          scrollbarWidth: 'none',
        }}
        aria-label={`${urls.length} fotos — deslize para o lado`}
      >
        {urls.map((u, i) => (
          <div
            key={`${u}-${i}`}
            className="w-full flex-shrink-0"
            style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
          >
            <PostMedia
              url={u}
              mediaType={mediaType}
              // As dimensões gravadas são as da PRIMEIRA foto; usá-las nas
              // outras reservaria o espaço errado e causaria salto. Só a
              // primeira aproveita o CLS zero.
              mediaWidth={i === 0 ? mediaWidth : null}
              mediaHeight={i === 0 ? mediaHeight : null}
              muted={muted}
              onToggleMute={onToggleMute}
            />
          </div>
        ))}
      </div>

      {/* Contador "1/5" no canto, como o Instagram. Fica à ESQUERDA do selo
          "à venda", que já ocupa o canto direito (`top-3 right-3`). */}
      <div
        className="absolute text-white font-bold pointer-events-none"
        style={{
          top: 12,
          right: 12,
          background: 'rgba(0,0,0,.6)',
          borderRadius: 999,
          padding: '3px 10px',
          fontSize: 12,
          lineHeight: 1.4,
        }}
        data-testid="carousel-contador"
      >
        {atual + 1}/{urls.length}
      </div>

      {/* Bolinhas: dizem quantas faltam sem obrigar a deslizar até o fim. */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center gap-1.5"
        style={{ bottom: 10 }}
      >
        {urls.map((u, i) => (
          <button
            key={`ponto-${u}-${i}`}
            type="button"
            onClick={() => irPara(i)}
            aria-label={`Ver foto ${i + 1} de ${urls.length}`}
            aria-current={i === atual}
            style={{
              width: i === atual ? 7 : 5,
              height: i === atual ? 7 : 5,
              borderRadius: 999,
              background: i === atual ? '#fff' : 'rgba(255,255,255,.55)',
              boxShadow: '0 0 2px rgba(0,0,0,.5)',
              padding: 0,
              border: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
