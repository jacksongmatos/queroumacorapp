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

    // Casca Capacitor: salva NATIVAMENTE na pasta Documents (Arquivos/Files),
    // o caminho confiável em WebView (onde blob:/data: download falha). Só o
    // app instalado com o plugin Filesystem entra aqui; navegador/PWA seguem
    // pro anchor abaixo.
    try {
      const { native, blobToBase64 } = await import('@/lib/native');
      if (native.fs.isAvailable()) {
        const b64 = await blobToBase64(blob);
        const r = await native.fs.saveFile(filename, b64);
        if (r.status === 'ok') return 'downloaded';
        // erro no save nativo → continua pro fallback anchor.
      }
    } catch {
      // import/plugin indisponível → segue pro anchor.
    }

    // WebView Android sem share de arquivo: blob: não chega no lado nativo
    // (Save As vazio que não salva). No app, o próprio dataUrl de origem já
    // carrega os bytes — anchor direto nele o wrapper decodifica e grava.
    // Gate era `isAndroidWebView`, que exige o token `wv` (ou "WebIntoApp")
    // no user agent — e o wrapper não tem nenhum dos dois: os pings
    // `scrollpin-diag` de produção vieram todos com `wv=false`. Resultado: o
    // app instalado caía no `blob:` mesmo assim, que é o "Save As" vazio que
    // esta linha existia pra evitar. Como o navegador Android de verdade já
    // foi atendido pelo `navigator.share` acima, basta perguntar se é
    // Android.
    const { isAndroid } = await import('@/lib/hooks/useAndroidWebViewScrollPin');
    const inWebView = isAndroid(navigator.userAgent || '');
    const href = inWebView ? dataUrl : URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      if (!inWebView) URL.revokeObjectURL(href);
    }, 100);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
