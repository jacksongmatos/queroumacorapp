// Montagem global do useAndroidWebViewScrollPin (trava do pull-to-refresh
// nativo do wrapper Android). Vive no RootLayout — e não no AppShell —
// porque o gesto de reload também dispara nas telas fora do shell
// (/login, /completar-perfil). Fora do WebView Android o hook é no-op.
'use client';

import { useAndroidWebViewScrollPin } from '@/lib/hooks/useAndroidWebViewScrollPin';

export function AndroidWebViewScrollPin() {
  useAndroidWebViewScrollPin();
  return null;
}
