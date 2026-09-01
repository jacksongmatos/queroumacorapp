// @vitest-environment jsdom
//
// Carrossel de post (01/09/2026). Antes disto o composer deixava escolher
// até 5 fotos, subia TODAS pro Storage e gravava só a primeira — as outras
// quatro viravam arquivo órfão, sem ninguém ser avisado.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/lib/cfImg', () => ({
  cfImg: (u: string) => u,
  cfImgSrcSet: () => '',
}));

import { PostCarousel } from '@/app/feed/PostCarousel';

const URLS = ['a.jpg', 'b.jpg', 'c.jpg'];

function montar(urls = URLS) {
  return render(
    <PostCarousel urls={urls} mediaType="image" muted onToggleMute={vi.fn()} />,
  );
}

afterEach(cleanup);

describe('PostCarousel', () => {
  it('mostra TODAS as fotos, não só a primeira', () => {
    const { container } = montar();
    expect(container.querySelectorAll('img').length).toBe(3);
  });

  it('tem o contador começando em 1/N', () => {
    montar();
    expect(screen.getByTestId('carousel-contador').textContent).toBe('1/3');
  });

  it('o contador acompanha o deslize', () => {
    const { container } = montar();
    const trilho = container.querySelector('[aria-label*="deslize"]') as HTMLDivElement;
    Object.defineProperty(trilho, 'clientWidth', { value: 300, configurable: true });
    trilho.scrollLeft = 600; // terceira foto
    fireEvent.scroll(trilho);
    expect(screen.getByTestId('carousel-contador').textContent).toBe('3/3');
  });

  it('uma bolinha por foto, com a atual marcada', () => {
    montar();
    const pontos = screen.getAllByLabelText(/Ver foto \d de 3/);
    expect(pontos.length).toBe(3);
    expect(pontos[0].getAttribute('aria-current')).toBe('true');
  });

  it('o gesto horizontal não encadeia no scroll do feed', () => {
    const { container } = montar();
    const trilho = container.querySelector('[aria-label*="deslize"]') as HTMLDivElement;
    expect(trilho.style.overscrollBehaviorX).toBe('contain');
  });

  it('só a primeira foto usa as dimensões gravadas (as outras causariam salto)', () => {
    const { container } = render(
      <PostCarousel
        urls={URLS}
        mediaType="image"
        mediaWidth={1080}
        mediaHeight={1350}
        muted
        onToggleMute={vi.fn()}
      />,
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs[0].getAttribute('width')).toBe('1080');
    expect(imgs[1].getAttribute('width')).toBeNull();
  });
});
