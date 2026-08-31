// camera — decisões puras em volta do "tirar foto na hora".
//
// Motivo (2026-08-30): no app empacotado (WebIntoApp) a WebView só abre a
// galeria se o wrapper implementar `onShowFileChooser`. Como ele não
// implementa, tocar em "Trocar foto" ou em "Toque pra escolher" não faz
// NADA — dois pintores ficaram sem trocar a foto de perfil e sem publicar
// portfólio (o `filePickerWatch` já detectava e mandava pro navegador,
// que é uma saída ruim: exige login de novo no Chrome).
//
// O caminho que NÃO passa pelo seletor de arquivos é a câmera:
// `getUserMedia` + canvas produz um File na mão, sem chooser nenhum.
// (A câmera é outra permissão do wrapper, então pode falhar também — a
// diferença é que a falha aqui é VISÍVEL: a promise rejeita.)
//
// Aqui ficam só as decisões testáveis; o vídeo/canvas vive no
// componente `CameraCapture`.

interface NavLike {
  mediaDevices?: { getUserMedia?: unknown };
}

/** O ambiente sequer tem a API? (SSR, WebView antiga, http sem TLS.) */
export function temCamera(nav?: NavLike | null): boolean {
  const n = nav ?? (typeof navigator === 'undefined' ? null : (navigator as NavLike));
  return typeof n?.mediaDevices?.getUserMedia === 'function';
}

/**
 * Vale a pena MOSTRAR o botão "tirar foto" ao lado do seletor?
 *
 * Sim em celular/tablet (tela de toque), onde a câmera é a fonte natural
 * da foto e onde mora o bug do wrapper. No desktop o botão só poluiria —
 * lá o seletor de arquivos funciona.
 */
export function ofereceCamera(opts?: { nav?: NavLike | null; toque?: boolean }): boolean {
  if (!temCamera(opts?.nav)) return false;
  const toque =
    opts?.toque ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false);
  return toque;
}

export type FalhaCamera = 'negada' | 'sem-camera' | 'em-uso' | 'sem-suporte' | 'erro';

/** Traduz a exceção do getUserMedia pro que a pessoa precisa fazer. */
export function erroDeCamera(e: unknown): { tipo: FalhaCamera; msg: string } {
  const nome = (e as { name?: string } | null)?.name ?? '';
  if (nome === 'NotAllowedError' || nome === 'PermissionDeniedError') {
    return {
      tipo: 'negada',
      msg: 'A câmera está bloqueada. Libere a permissão de câmera do QueroUmaCor nos ajustes do celular e tente de novo.',
    };
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError' || nome === 'DevicesNotFoundError') {
    return { tipo: 'sem-camera', msg: 'Não encontrei nenhuma câmera neste aparelho.' };
  }
  if (nome === 'NotReadableError' || nome === 'TrackStartError') {
    return { tipo: 'em-uso', msg: 'A câmera está sendo usada por outro app. Feche o outro app e tente de novo.' };
  }
  if (nome === 'TypeError' || nome === 'NotSupportedError' || nome === 'TimeoutError') {
    // TimeoutError é o nosso: em WebView o getUserMedia pode nunca
    // responder (nem resolve, nem rejeita) quando o wrapper não trata a
    // permissão. Pra quem está olhando, é igual a "não dá aqui".
    return {
      tipo: 'sem-suporte',
      msg: 'Este app não conseguiu abrir a câmera. Dá pra usar pelo navegador do celular (queroumacor.com.br).',
    };
  }
  return { tipo: 'erro', msg: 'Não consegui abrir a câmera agora.' };
}

/** Nome do arquivo gerado — só pra não chegar "blob" no bucket. */
export function nomeDaFoto(agora: number = Date.now()): string {
  return `foto-${agora}.jpg`;
}

/**
 * Tamanho de saída: no máximo `max` no lado maior, mantendo a proporção.
 * Foto de 4000px vira arquivo de vários MB e estoura o teto de 5MB do
 * avatar — e nenhuma tela do app mostra mais que ~1600px.
 */
export function tamanhoDeSaida(
  w: number,
  h: number,
  max = 1600,
): { w: number; h: number } {
  if (!w || !h) return { w: max, h: max };
  const maior = Math.max(w, h);
  if (maior <= max) return { w: Math.round(w), h: Math.round(h) };
  const k = max / maior;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
