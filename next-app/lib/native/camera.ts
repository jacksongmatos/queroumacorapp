// camera.ts — câmera/galeria nativas com contrato de fallback explícito.
//
// O caller distingue 3 desfechos:
//   'unavailable' → ambiente sem plugin: USE O FALLBACK WEB
//                   (getUserMedia / <input type=file>, como hoje).
//   'cancelled'   → usuário desistiu no prompt NATIVO: NÃO abrir o fallback
//                   web em seguida (seria um segundo prompt do nada).
//   'ok'          → `file` pronto pra entrar no pipeline de upload EXISTENTE
//                   (services atuais fazem o upload — regra de negócio de
//                   storage/moderação/insert continua num lugar só).

import { getPlugin, isNativePlatform } from './platform';

interface CameraPlugin {
  getPhoto: (opts: {
    resultType: 'base64';
    source?: 'PROMPT' | 'CAMERA' | 'PHOTOS';
    quality?: number;
    correctOrientation?: boolean;
  }) => Promise<{ base64String?: string; format?: string }>;
  pickImages?: (opts: {
    quality?: number;
    limit?: number;
  }) => Promise<{ photos?: Array<{ webPath?: string; format?: string }> }>;
}

export type NativePhotoResult =
  | { status: 'unavailable' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ok'; file: File };

export type NativePickResult =
  | { status: 'unavailable' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ok'; files: File[] };

function base64ToFile(base64: string, format: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = format || 'jpeg';
  return new File([bytes], `foto-${Date.now()}.${ext}`, {
    type: `image/${ext}`,
  });
}

/** true quando a câmera nativa pode ser oferecida no lugar da web. */
export function isNativeCameraAvailable(): boolean {
  return isNativePlatform() && !!getPlugin<CameraPlugin>('Camera');
}

/** true quando o picker nativo de galeria (seleção múltipla) está disponível. */
export function isNativePickerAvailable(): boolean {
  const cam = getPlugin<CameraPlugin>('Camera');
  return isNativePlatform() && !!cam?.pickImages;
}

/**
 * Abre o PICKER NATIVO de galeria (Android Photo Picker / iOS PHPicker via
 * @capacitor/camera pickImages) e devolve os arquivos escolhidos. Substitui o
 * <input type=file>, que na WebView do wrapper às vezes não abre e mata o app.
 * `limit` = máximo de fotos (0 = sem limite do plugin).
 *
 * O plugin devolve `webPath` (URL local servida pela ponte) — buscamos o blob
 * e montamos File, pra entrar no MESMO pipeline de upload (normalizarArquivo →
 * uploadMedia). Cancelar sem escolher nada rejeita com "cancel" (≠ erro).
 */
export async function pickImagesNative(limit = 5): Promise<NativePickResult> {
  const camera = getPlugin<CameraPlugin>('Camera');
  if (!isNativePlatform() || !camera?.pickImages) return { status: 'unavailable' };
  try {
    const res = await camera.pickImages({ quality: 90, limit });
    const photos = res.photos ?? [];
    if (photos.length === 0) return { status: 'cancelled' };
    const files: File[] = [];
    for (const p of photos) {
      if (!p.webPath) continue;
      // webPath é servido pela ponte do Capacitor; fetch lê o blob local.
      const blob = await fetch(p.webPath).then((r) => r.blob());
      const ext = (p.format || blob.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
      files.push(
        new File([blob], `galeria-${Date.now()}-${files.length}.${ext}`, {
          type: blob.type || `image/${ext}`,
        }),
      );
    }
    if (files.length === 0) return { status: 'error', message: 'Nenhuma imagem lida.' };
    return { status: 'ok', files };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return { status: 'cancelled' };
    return { status: 'error', message: msg };
  }
}

/**
 * Abre câmera/galeria nativa (prompt do sistema escolhe a origem) e devolve
 * um File — orientação EXIF corrigida e qualidade 85 aplicadas pelo plugin.
 */
export async function takePhotoNative(
  source: 'PROMPT' | 'CAMERA' | 'PHOTOS' = 'PROMPT',
): Promise<NativePhotoResult> {
  const camera = getPlugin<CameraPlugin>('Camera');
  if (!isNativePlatform() || !camera) return { status: 'unavailable' };
  try {
    const photo = await camera.getPhoto({
      resultType: 'base64',
      source,
      quality: 85,
      correctOrientation: true,
    });
    if (!photo.base64String) {
      return { status: 'error', message: 'A câmera não retornou imagem.' };
    }
    return { status: 'ok', file: base64ToFile(photo.base64String, photo.format ?? 'jpeg') };
  } catch (e) {
    // O plugin rejeita com "User cancelled photos app" (e variações) quando
    // a pessoa fecha o prompt — isso não é erro.
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return { status: 'cancelled' };
    return { status: 'error', message: msg };
  }
}
