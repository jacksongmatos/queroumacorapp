// shareOrDownloadImage — salva uma imagem (data URL) do jeito que FUNCIONA
// em cada ambiente. Motivação (2026-08-28): os botões de download da Arte
// pra IG usavam `<a download href="data:...">`, e dentro do WebView Android
// o wrapper trata isso como NAVEGAÇÃO externa — o app "fechava"/bugava e o
// arquivo não salvava. Mesmo remédio do PDF (quotePdf.ts):
//   1. share sheet nativo (navigator.share com arquivo) — o usuário salva
//      na galeria, manda pro WhatsApp, etc.;
//   2. fallback: download via anchor com BLOB (não data URL — anchor+blob
//      funciona em navegador de verdade e não navega a página).
// Best-effort: falha silenciosa nunca pode quebrar a tela.

export async function shareOrDownloadImage(
  dataUrl: string,
  filename: string,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: blob.type || 'image/png' });

    type Nav = Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string }) => Promise<void>;
    };
    const nav = typeof navigator !== 'undefined' ? (navigator as Nav) : null;
    if (nav?.canShare && nav?.share && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'cancelled';
        // Outro erro: cai pro download.
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
