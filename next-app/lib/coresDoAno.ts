// coresDoAno.ts — as Cores do Ano das fabricantes, mostradas uma única vez
// quando a pessoa abre a Loja.
//
// TRÊS decisões que valem explicar:
//
//  1. A CHAVE DO "já vi" CARREGA O ANO (`cor_do_ano_visto_2026`). Chave fixa
//     faria o aviso do ano que vem nunca aparecer pra quem já viu o deste ano
//     — o modal morreria em silêncio, sem ninguém notar. Trocando o
//     `ANO_DAS_CORES` + a lista, todo mundo volta a ver uma vez.
//
//  2. A SUVINIL ELEGEU DUAS CORES EM 2026 (Tempestade e Cipó da Amazônia), e
//     as duas estão aqui. Escolher uma "principal" seria inventar hierarquia
//     que a fabricante não publicou.
//
//  3. O `hex` é só pro quadradinho da tela. Ele é a conversão do RGB
//     divulgado e NÃO substitui o código de fórmula (`codigo`/`ncs`), que é o
//     que a loja usa pra preparar a tinta — tela de celular não reproduz
//     tinta, e prometer que reproduz é o tipo de erro que vira reclamação no
//     balcão.

export interface CorDoAno {
  /** Fabricante que elegeu a cor. */
  marca: string;
  /** Nome comercial da cor. */
  nome: string;
  /** Código de catálogo da fabricante (é o que se pede na loja). */
  codigo: string;
  /** Código NCS, quando a fabricante publica (Suvinil publica; a SW não). */
  ncs?: string;
  /** Aproximação em tela do tom. Não é referência de fórmula. */
  hex: string;
  /** Uma linha sobre o tom — o que a fabricante diz dele. */
  descricao: string;
}

/** Ano da edição em cartaz. Trocar junto com a lista abaixo. */
export const ANO_DAS_CORES = 2026;

export const CORES_DO_ANO: readonly CorDoAno[] = [
  {
    marca: 'Sherwin-Williams',
    nome: 'Universal Khaki',
    codigo: 'SW 6150',
    hex: '#b8a992',
    descricao: 'Neutro meio-termo, de fundo levemente amarelado.',
  },
  {
    marca: 'Suvinil',
    nome: 'Tempestade',
    codigo: 'D177',
    ncs: 'NCS 2609-Y99R',
    hex: '#c0afad',
    descricao: 'Rosa acinzentado claro, de acabamento acolhedor.',
  },
  {
    marca: 'Suvinil',
    nome: 'Cipó da Amazônia',
    codigo: 'N879',
    ncs: 'NCS 5030-G70Y',
    hex: '#767745',
    descricao: 'Verde puxado pro amarelo, inspirado na mata.',
  },
];

const CHAVE = `cor_do_ano_visto_${ANO_DAS_CORES}`;

// Rede de segurança pra quando o localStorage está bloqueado (aba anônima do
// Safari, WebView com storage desligado): sem isso o modal reapareceria a
// cada ida e volta pra Loja dentro da MESMA sessão, que é o incômodo de
// verdade. Com storage funcionando esta variável é irrelevante.
let vistoNestaSessao = false;

/** Já mostramos o aviso deste ano pra esta pessoa neste aparelho? */
export function jaViuCoresDoAno(): boolean {
  if (vistoNestaSessao) return true;
  try {
    if (typeof window === 'undefined') return true; // SSR: nunca abre
    return window.localStorage.getItem(CHAVE) === '1';
  } catch {
    // Storage bloqueado: cai no guarda de sessão acima.
    return false;
  }
}

/** Marca como visto — o modal não volta a abrir sozinho. */
export function marcarCoresDoAnoVistas(): void {
  vistoNestaSessao = true;
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHAVE, '1');
  } catch {
    // silencioso — ver comentário do topo.
  }
}

/** Só pros testes: devolve o módulo ao estado de quem nunca viu. */
export function _resetCoresDoAnoParaTeste(): void {
  vistoNestaSessao = false;
}

/**
 * Preto ou branco por cima do tom, pelo que enxerga melhor.
 *
 * Os três tons de 2026 são médios, então nenhum dos dois é óbvio: o Cipó da
 * Amazônia pede texto claro e o Universal Khaki pede escuro. A conta é a
 * luminância relativa da WCAG — chutar por "parece claro" erra justamente na
 * faixa do meio, que é onde estas cores vivem.
 */
export function textoSobre(hex: string): '#ffffff' | '#1a1a2e' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#1a1a2e';
  const n = parseInt(m[1], 16);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum =
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255);
  // Contraste contra branco vs. contra preto (fórmula da WCAG, +0.05).
  return (1.05) / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#ffffff' : '#1a1a2e';
}
