'use client';
// Registra o Service Worker no client. Mount-once no RootLayout (não dentro
// do AppShell, porque queremos cobrir login/signup também — assim o SW pega
// cache desde o primeiro request).
//
// Pula em:
//  - Server (sem window)
//  - Dev (Next.js Hot Reload + SW briga; só registra em production)
//  - Browsers sem SW support (raro hoje)

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!('serviceWorker' in navigator)) return undefined;
    // Skip em localhost dev pra não competir com HMR do Next.js, mas registra
    // em qualquer outro ambiente (Cloudflare Pages, preview, prod) — antes
    // tinha gate NODE_ENV === 'production' que às vezes não bate no CF Pages.
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return undefined;

    let registration: ServiceWorkerRegistration | null = null;

    // Ao voltar do background, pede ao browser pra reconferir o /sw.js. É o
    // que faz o app empacotado (WebView) enxergar um deploy novo sem precisar
    // ser morto e reaberto: o WebView não recarrega a página ao ser retomado,
    // então sem este empurrão o SW antigo poderia seguir no ar por dias.
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        registration?.update();
      } catch {
        // update() pode estourar se o registro já morreu — irrelevante.
      }
    };

    // Registra em window.load pra não competir com hidratação inicial.
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          registration = reg;
          // Atualização disponível: o novo SW fica em "waiting".
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                // Há um SW novo aguardando — força ativação imediata.
                // Pra UX mais conservadora, poderíamos mostrar toast "Atualizar"
                // e deixar o user decidir. Por ora, ativa silencioso.
                newSW.postMessage('SKIP_WAITING');
              }
            });
          });
          document.addEventListener('visibilitychange', onResume);
        })
        .catch(() => {
          // SW falhou — segue sem cache, app funciona normal.
        });
    };

    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad);
    }

    return () => {
      window.removeEventListener('load', onLoad);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, []);

  return null;
}
