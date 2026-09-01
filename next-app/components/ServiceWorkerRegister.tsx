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
import { reportFailure } from '@/lib/utils/reportFailure';

// Chave da sonda diária (ver `sondar` abaixo).
const CHAVE_SONDA = 'qucSwPing';

/**
 * Conta pro servidor se o service worker está REALMENTE no comando da
 * página neste aparelho.
 *
 * Por que isto existe (2026-09-01): o `sw.js` v5 é construído pra que um
 * 5xx nunca chegue cru na tela — troca pela página "Reconectando…". Só que
 * a tela "500 | Server Error" apareceu no app instalado assim mesmo. Isso
 * PROVA que o SW não controlava aquela navegação, mas não diz por quê:
 * registro falhando em silêncio (o `.catch()` aqui embaixo engolia tudo) ou
 * limitação da WebView. Sem essa resposta, qualquer correção no `sw.js` é
 * chute — e a única telemetria que existia (`sw-nav-5xx`) depende do SW
 * estar no comando, que é justamente o que falta.
 *
 * A tela `/diag` também mostra isso, mas exige que alguém navegue até lá —
 * e na WebView não há barra de endereço. Aqui a resposta vem sozinha, de
 * todos os aparelhos.
 *
 * 1 linha por aparelho por DIA (marca em localStorage): responde a pergunta
 * sem encher a tabela `errors`. Best-effort — nunca atrapalha o app.
 */
function sondar(nota: string): void {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(CHAVE_SONDA) === hoje) return;
    localStorage.setItem(CHAVE_SONDA, hoje);
  } catch {
    // Storage bloqueado: reporta mesmo assim, uma vez por carga.
  }
  reportFailure('sw-status', new Error(nota), { ctx: 'service-worker' });
}

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
          // Registrar NÃO significa controlar: o SW só assume a página na
          // navegação seguinte (ou via clients.claim()). Por isso a sonda
          // olha `controller`, que é o que decide se as defesas do sw.js
          // valem alguma coisa nesta página.
          const controlando = !!navigator.serviceWorker.controller;
          sondar(
            `sw registrado | controlando=${controlando ? 'sim' : 'NAO'} | ` +
              `escopo=${reg.scope} | ativo=${reg.active ? 'sim' : 'nao'}`,
          );
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
        .catch((err) => {
          // SW falhou. O app funciona sem ele — mas TODAS as defesas de
          // navegação (retry, página "Reconectando…") vão junto, e isso
          // precisa aparecer em algum lugar em vez de sumir aqui dentro.
          sondar(`sw NAO registrou: ${(err as Error)?.message || String(err)}`);
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
