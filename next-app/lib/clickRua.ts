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
