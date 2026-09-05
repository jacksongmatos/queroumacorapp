// clickRua — catálogo das edições da revista Click Rua ("Graffiti do Brasil
// inteiro", revista digital de graffiti e cultura hip hop).
//
// As páginas vivem em `public/click-rua/edNN/` como WebP e são servidas
// estáticas pelo Cloudflare Pages. Não vão pro banco de propósito: são
// ARQUIVO, não dado — ninguém consulta, filtra ou edita página de revista, e
// edição nova já vem com um commit junto (o catálogo abaixo muda). Storage no
// Supabase só acrescentaria um upload manual e uma URL assinada pra expirar.
//
// Edição nova = converter os PNG pra WebP (sharp, qualidade 82 — 16 MB de
// PNG viraram 1,1 MB) em `public/click-rua/edNN/1..N.webp`, gerar a capa
// reduzida e acrescentar uma entrada aqui trocando `em_breve` por `pronta`.

export interface EdicaoPronta {
  status: 'pronta';
  /** Número impresso na capa. */
  numero: number;
  /** Mês/ano da edição, como sai na capa. */
  quando: string;
  /** Chamada de capa — o que essa edição traz. */
  destaque: string;
  /** Pasta em `public/click-rua/`. */
  slug: string;
  /** Quantidade de páginas (arquivos 1.webp … N.webp). */
  paginas: number;
  capa: string;
}

export interface EdicaoEmBreve {
  status: 'em_breve';
  numero: number;
}

export type Edicao = EdicaoPronta | EdicaoEmBreve;

export const CLICK_RUA_TAG = '@click_rua';

export const EDICOES: readonly Edicao[] = [
  {
    status: 'pronta',
    numero: 1,
    quando: 'setembro de 2020',
    destaque: 'B.Girl LU BSB e sua trajetória',
    slug: 'ed01',
    paginas: 8,
    capa: '/click-rua/ed01-capa.webp',
  },
  { status: 'em_breve', numero: 2 },
  { status: 'em_breve', numero: 3 },
  { status: 'em_breve', numero: 4 },
  { status: 'em_breve', numero: 5 },
  { status: 'em_breve', numero: 6 },
];

/** Caminho da página `n` (1-based) de uma edição. */
export function paginaUrl(ed: EdicaoPronta, n: number): string {
  return `/click-rua/${ed.slug}/${n}.webp`;
}

/** Todas as páginas de uma edição, em ordem. */
export function paginasDe(ed: EdicaoPronta): string[] {
  return Array.from({ length: ed.paginas }, (_, i) => paginaUrl(ed, i + 1));
}

export function edicoesProntas(lista: readonly Edicao[] = EDICOES): EdicaoPronta[] {
  return lista.filter((e): e is EdicaoPronta => e.status === 'pronta');
}

/** Rótulo curto da edição: "Edição #01". Dois dígitos, como na capa. */
export function rotuloEdicao(numero: number): string {
  return `Edição #${String(numero).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Matemática da virada de página (flipbook).
//
// A folha gira em torno da LOMBADA (borda esquerda), como página de revista
// de verdade: 0° = deitada, -180° = virada por cima pra esquerda. O mesmo
// intervalo serve pros dois sentidos — avançar vai de 0 a -180, voltar vem
// de -180 a 0 —, o que deixa um único elemento animado dar conta dos dois.

export const ANGULO_DEITADO = 0;
export const ANGULO_VIRADO = -180;

export type SentidoVirada = 'frente' | 'tras';

/**
 * Ângulo da folha a partir do quanto o dedo andou.
 *
 * `dx` é o deslocamento horizontal em px (negativo = arrastou pra esquerda) e
 * `largura` a da tela. Arrastar a tela inteira vira a página inteira.
 */
export function anguloDaVirada(dx: number, largura: number, sentido: SentidoVirada): number {
  if (!Number.isFinite(dx) || !Number.isFinite(largura) || largura <= 0) {
    return sentido === 'frente' ? ANGULO_DEITADO : ANGULO_VIRADO;
  }
  const fracao = (dx / largura) * 180;
  const bruto = sentido === 'frente' ? fracao : ANGULO_VIRADO + fracao;
  // Trava nos extremos: sem isto, continuar arrastando passa de -180 e a
  // folha volta a aparecer girando do outro lado.
  return Math.min(ANGULO_DEITADO, Math.max(ANGULO_VIRADO, bruto));
}

/**
 * Passou da metade? Aí a folha completa a virada ao soltar; senão volta.
 * É o que faz o gesto curto ser desistência em vez de virar sem querer.
 */
export function confirmaVirada(angulo: number, sentido: SentidoVirada): boolean {
  return sentido === 'frente' ? angulo <= -90 : angulo >= -90;
}
