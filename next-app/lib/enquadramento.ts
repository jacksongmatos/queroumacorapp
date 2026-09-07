// enquadramento — a conta pura de "que pedaço da foto entra no quadro".
//
// Motivo (2026-09-07): quem publicava um quadro em pé via o feed cortar a
// obra em cima e embaixo, sem ter como escolher. Aqui vive a geometria que
// o composer usa DUAS vezes com o mesmo resultado: pra desenhar a prévia
// (CSS, em porcentagem) e pra recortar de verdade no canvas (pixels). Se as
// duas contas fossem separadas, a prévia mentiria.
//
// Convenções:
//   - `proporcao` é largura/altura do QUADRO (1 = quadrado, 0.8 = 4:5).
//     `null` = original: a foto sobe como está, sem recorte nenhum.
//   - `Deslocamento` é a posição da janela de recorte sobre a foto, de 0 a
//     1 em cada eixo (0.5 = centro). Só o eixo em que a foto sobra importa.
//   - `modo`: 'preencher' corta o que sobra (object-fit: cover);
//     'ajustar' encolhe a foto inteira dentro do quadro e sobra fundo
//     (object-fit: contain) — é a opção "não cortar nada".

export type ProporcaoKey = 'original' | '1:1' | '4:5' | '16:9';
export type ModoEnquadramento = 'preencher' | 'ajustar';

export interface Deslocamento {
  x: number;
  y: number;
}

export interface Enquadramento {
  proporcao: ProporcaoKey;
  modo: ModoEnquadramento;
  /** Um por foto, alinhado com a lista de arquivos do composer. */
  deslocamentos: Deslocamento[];
}

export const PROPORCOES: ReadonlyArray<{
  key: ProporcaoKey;
  label: string;
  /** largura / altura do quadro; null = sem recorte. */
  ratio: number | null;
}> = [
  { key: 'original', label: 'Original', ratio: null },
  { key: '1:1', label: 'Quadrado', ratio: 1 },
  { key: '4:5', label: 'Retrato 4:5', ratio: 4 / 5 },
  { key: '16:9', label: 'Paisagem 16:9', ratio: 16 / 9 },
];

export const DESLOCAMENTO_CENTRO: Deslocamento = { x: 0.5, y: 0.5 };

export const ENQUADRAMENTO_PADRAO: Enquadramento = {
  proporcao: 'original',
  modo: 'preencher',
  deslocamentos: [],
};

export function ratioDe(key: ProporcaoKey): number | null {
  return PROPORCOES.find((p) => p.key === key)?.ratio ?? null;
}

export function clampDeslocamento(d: Deslocamento): Deslocamento {
  const c = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  return { x: c(d.x), y: c(d.y) };
}

/** Retângulo de ORIGEM (em pixels da foto) que vira o quadro no modo preencher. */
export interface Recorte {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function recorteCover(
  imgW: number,
  imgH: number,
  proporcao: number,
  desloc: Deslocamento,
): Recorte {
  const d = clampDeslocamento(desloc);
  const imgRatio = imgW / imgH;
  if (imgRatio > proporcao) {
    // Foto mais larga que o quadro: a altura entra inteira, sobra largura.
    const sw = imgH * proporcao;
    return { sx: (imgW - sw) * d.x, sy: 0, sw, sh: imgH };
  }
  // Foto mais alta que o quadro: a largura entra inteira, sobra altura.
  const sh = imgW / proporcao;
  return { sx: 0, sy: (imgH - sh) * d.y, sw: imgW, sh };
}

/** Caixa (em pixels do quadro) onde a foto inteira cabe, centralizada. */
export interface Caixa {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function caixaContain(
  quadroW: number,
  quadroH: number,
  imgW: number,
  imgH: number,
): Caixa {
  const escala = Math.min(quadroW / imgW, quadroH / imgH);
  const dw = imgW * escala;
  const dh = imgH * escala;
  return { dx: (quadroW - dw) / 2, dy: (quadroH - dh) / 2, dw, dh };
}

/**
 * Tamanho do arquivo de saída. Nunca AMPLIA a foto: o lado maior do
 * resultado é no máximo `maxDim` e no máximo o que a foto tem de verdade.
 */
export function tamanhoSaida(
  imgW: number,
  imgH: number,
  proporcao: number,
  modo: ModoEnquadramento,
  maxDim: number,
): { w: number; h: number } {
  let baseW: number;
  let baseH: number;
  if (modo === 'preencher') {
    const r = recorteCover(imgW, imgH, proporcao, DESLOCAMENTO_CENTRO);
    baseW = r.sw;
    baseH = r.sh;
  } else {
    // O quadro cresce até encostar na foto no lado que ela é mais justa,
    // pra não inventar pixels no lado que sobra.
    const imgRatio = imgW / imgH;
    if (imgRatio > proporcao) {
      baseW = imgW;
      baseH = imgW / proporcao;
    } else {
      baseH = imgH;
      baseW = imgH * proporcao;
    }
  }
  const escala = Math.min(1, maxDim / Math.max(baseW, baseH));
  return {
    w: Math.max(1, Math.round(baseW * escala)),
    h: Math.max(1, Math.round(baseH * escala)),
  };
}

/**
 * Como posicionar o <img> dentro do quadro da prévia, em PORCENTAGEM do
 * quadro. É a mesma conta do recorte, só que vista do lado de fora: em vez
 * de "que pedaço da foto entra", "onde a foto inteira fica" (parte dela
 * fora do quadro, escondida pelo overflow).
 */
export interface EstiloPreview {
  width: string;
  height: string;
  left: string;
  top: string;
  /** true quando há sobra pra arrastar no modo preencher. */
  arrastavel: boolean;
}

export function estiloPreview(
  imgW: number,
  imgH: number,
  proporcao: number,
  desloc: Deslocamento,
  modo: ModoEnquadramento,
): EstiloPreview {
  const d = clampDeslocamento(desloc);
  const imgRatio = imgW / imgH;
  const pct = (v: number) => `${v}%`;
  if (modo === 'ajustar') {
    if (imgRatio > proporcao) {
      const h = (proporcao / imgRatio) * 100;
      return { width: '100%', height: pct(h), left: '0%', top: pct((100 - h) / 2), arrastavel: false };
    }
    const w = (imgRatio / proporcao) * 100;
    return { width: pct(w), height: '100%', left: pct((100 - w) / 2), top: '0%', arrastavel: false };
  }
  if (imgRatio > proporcao) {
    const w = (imgRatio / proporcao) * 100;
    return { width: pct(w), height: '100%', left: pct(-(w - 100) * d.x), top: '0%', arrastavel: w > 100.5 };
  }
  const h = (proporcao / imgRatio) * 100;
  return { width: '100%', height: pct(h), left: '0%', top: pct(-(h - 100) * d.y), arrastavel: h > 100.5 };
}

/**
 * Converte um arrasto em pixels no quadro pra deslocamento novo. `sobraPx`
 * é quanto a foto passa do quadro naquele eixo (largura da foto menos a do
 * quadro, em px). Arrastar pra ESQUERDA mostra o lado DIREITO da foto —
 * o deslocamento cresce.
 */
export function arrastar(
  atual: Deslocamento,
  deltaPx: { x: number; y: number },
  sobraPx: { x: number; y: number },
): Deslocamento {
  const passo = (delta: number, sobra: number, base: number) =>
    sobra > 0 ? base - delta / sobra : base;
  return clampDeslocamento({
    x: passo(deltaPx.x, sobraPx.x, atual.x),
    y: passo(deltaPx.y, sobraPx.y, atual.y),
  });
}

/** String pra CSS `aspect-ratio` a partir de largura/altura gravadas. */
export function aspectRatioCss(w: number | null | undefined, h: number | null | undefined): string | null {
  if (!w || !h || w <= 0 || h <= 0) return null;
  return `${w} / ${h}`;
}
