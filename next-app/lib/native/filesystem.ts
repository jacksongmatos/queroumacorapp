// filesystem.ts — salvar arquivo (PDF de orçamento, imagem) no aparelho de
// forma NATIVA, em vez de depender do download da WebView (que no wrapper não
// funciona: blob:/data: o DownloadManager recusa, e não há share de arquivo).
//
// Escreve na pasta Documents do app (visível em Arquivos/Files). Devolve o
// caminho pra a UI mostrar "salvo em…". No-op fora da casca — o caller mantém o
// caminho web de sempre (upload pro bucket + link, share sheet).

import { getPlugin, isNativePlatform } from './platform';

interface FilesystemPlugin {
  writeFile?: (opts: {
    path: string;
    data: string; // base64
    directory?: string;
    recursive?: boolean;
  }) => Promise<{ uri: string }>;
}

export type SaveFileResult =
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ok'; uri: string };

/** true quando dá pra salvar arquivo nativamente. */
export function isNativeFilesystemAvailable(): boolean {
  const fs = getPlugin<FilesystemPlugin>('Filesystem');
  return isNativePlatform() && !!fs?.writeFile;
}

/**
 * Salva `base64` como arquivo na pasta Documents do app. `fileName` inclui a
 * extensão (ex.: 'orcamento-123.pdf'). Fora da casca devolve 'unavailable'.
 */
export async function saveFileNative(
  fileName: string,
  base64: string,
): Promise<SaveFileResult> {
  const fs = getPlugin<FilesystemPlugin>('Filesystem');
  if (!isNativePlatform() || !fs?.writeFile) return { status: 'unavailable' };
  try {
    const res = await fs.writeFile({
      path: fileName,
      data: base64,
      directory: 'DOCUMENTS',
      recursive: true,
    });
    return { status: 'ok', uri: res.uri };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Converte um Blob em base64 puro (sem o prefixo data:) pro writeFile. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = typeof reader.result === 'string' ? reader.result : '';
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader falhou'));
    reader.readAsDataURL(blob);
  });
}
