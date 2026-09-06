// clickRua — tipos, rótulos e a matemática da virada de página da revista
// Click Rua ("Graffiti do Brasil inteiro").
//
// ONDE MORAM AS PÁGINAS: no bucket `click-rua` do Supabase, e a lista de
// edições na tabela `click_rua_editions` (migration 2026-09-06). Cada
// edição guarda a URL de cada página, em ordem — não um padrão de caminho.
// É isso que deixa a edição #01, que nasceu como arquivo estático em
// `public/click-rua/ed01/`, conviver com as que a loja sobe pelo portal: o
// leitor só usa a string como `src` e não sabe de onde ela veio.
//
// O catálogo estático abaixo é FALLBACK, não fonte: vale enquanto a tabela
// não existir (migration não rodada). Sem ele, rodar o deploy antes do SQL
// deixaria o tile abrindo numa banca vazia.

export interface EdicaoPronta {
  status: 'pronta';
  /** Número impresso na capa. */
  numero: number;
  /** Mês/ano da edição, como sai na capa. */
  quando: string | null;
  /** Chamada de capa — o que essa edição traz. */
  destaque: string | null;
  /** URL da capa (miniatura do card). */
  capa: string | null;
  /** URLs das páginas, na ordem de leitura. */
  paginas: string[];
}

export interface EdicaoEmBreve {
  status: 'em_breve';
  numero: number;
}

export type Edicao = EdicaoPronta | EdicaoEmBreve;

export const CLICK_RUA_TAG = '@click_rua';

/**
 * Fallback usado só enquanto `click_rua_editions` não existe. Aponta pros
 * arquivos que foram publicados junto com o app; depois que a migration
 * roda, quem manda é o banco.
 */
export const EDICOES_FALLBACK: readonly Edicao[] = [
  {
    status: 'pronta',
    numero: 1,
    quando: 'setembro de 2020',
    destaque: 'B.Girl LU BSB e sua trajetória',
    capa: '/click-rua/ed01-capa.webp',
    paginas: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `/click-rua/ed01/${n}.webp`),
  },
  { status: 'em_breve', numero: 2 },
  { status: 'em_breve', numero: 3 },
  { status: 'em_breve', numero: 4 },
  { status: 'em_breve', numero: 5 },
  { status: 'em_breve', numero: 6 },
];

/** Uma linha de `click_rua_editions` como o banco devolve. */
export interface LinhaEdicao {
  numero: number;
  quando: string | null;
  destaque: string | null;
  status: string | null;
  capa_url: string | null;
  paginas: string[] | null;
}

/**
 * Converte a linha do banco na edição que a tela usa.
 *
 * Uma edição só conta como PRONTA se tem página. A linha pode estar
 * marcada 'pronta' e ter chegado ali sem upload — criada primeiro, páginas
 * depois, ou upload que falhou no meio. Abrir um leitor de zero páginas é
 * tela preta sem saída, então nesse caso ela volta a ser "em breve".
 */
export function edicaoDeLinha(r: LinhaEdicao): Edicao {
  const paginas = (r.paginas ?? []).filter((p) => typeof p === 'string' && p.length > 0);
  if (r.status === 'pronta' && paginas.length > 0) {
    return {
      status: 'pronta',
      numero: r.numero,
      quando: r.quando,
      destaque: r.destaque,
      capa: r.capa_url || paginas[0]!,
      paginas,
    };
  }
  return { status: 'em_breve', numero: r.numero };
}

/** Páginas de uma edição, na ordem. */
export function paginasDe(ed: EdicaoPronta): string[] {
  return ed.paginas;
}

export function edicoesProntas(lista: readonly Edicao[]): EdicaoPronta[] {
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
