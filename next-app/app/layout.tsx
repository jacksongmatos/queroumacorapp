import type { Metadata, Viewport } from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import { Suspense } from 'react';
import { AuthProvider } from '@/components/AuthProvider';
import { QueryProvider } from '@/components/QueryProvider';
import { ToastViewport } from '@/components/ToastViewport';
import { StagingBanner } from '@/components/StagingBanner';
import { ReferralCapture } from '@/components/ReferralCapture';
import { DialogProvider } from '@/components/Dialog';
import { AuthGateProvider } from '@/components/AuthGate';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { AndroidWebViewScrollPin } from '@/components/AndroidWebViewScrollPin';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import './globals.css';

// Domínio do Supabase pra preconnect — economiza 100-300ms no primeiro request
// a cada nova sessão (DNS + TLS handshake feito eagerly).
const SUPABASE_HOST =
  (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

// Self-host de Syne (display/marca) + DM Sans (body) via next/font/google.
// Vanilla usa as mesmas duas fontes — Syne auto-hospedada via @font-face
// em styles.css e DM Sans do Google. Next/font inliniza tudo no bundle,
// sem network call externo, e expõe CSS var pra usar nos `var(--font-*)`
// declarados em globals.css.
const syne = Syne({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-syne',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'QueroUmaCor',
  description: 'A plataforma dos pintores profissionais',
  manifest: '/manifest.webmanifest',
  // Default explícito: páginas são indexáveis. Páginas autenticadas
  // (chat, perfil próprio, dashboards, admin) sobrescrevem com
  // `robots: { index: false }` no próprio page.tsx. Obs.: preview deploys
  // (*.pages.dev) ganham `X-Robots-Tag: noindex` do Cloudflare Pages —
  // isso é infra, não vem daqui, e não afeta queroumacor.com.br.
  robots: { index: true, follow: true },
  // Ícones servidos como assets estáticos em /public — `app/icon.png` virou
  // route dinâmica pro @cloudflare/next-on-pages e estourava build sem
  // `export const runtime = 'edge'`. Manter em /public evita o problema.
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'QueroUmaCor',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#ff6b35',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${syne.variable} ${dmSans.variable}`}>
      <head>
        {/* Preconnect ao Supabase — DNS + TCP + TLS handshake antecipado.
            Economiza 100-300ms na primeira requisição (Auth, RLS query). */}
        {SUPABASE_HOST ? (
          <>
            <link rel="preconnect" href={`https://${SUPABASE_HOST}`} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={`https://${SUPABASE_HOST}`} />
          </>
        ) : null}
        {/* Tema: claro por padrão, escuro opcional (opt-in pelo usuário via
            ThemeToggle). Lê localStorage.theme antes do paint pra evitar flash.
            Só ativa dark se a preferência salva for explicitamente 'dark' —
            não seguimos prefers-color-scheme pra manter o claro como default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
        {/* Pin pré-hidratação do Android (camada 1 da trava do
            pull-to-refresh nativo — ver useAndroidWebViewScrollPin.ts).
            Sem isso, do primeiro byte até o React hidratar o documento fica
            em scrollY 0 e o SwipeRefreshLayout do wrapper segue armado
            justamente durante o boot. Roda no <head>: estica o <html> (que
            já existe) e prende o scroll assim que possível, com re-pin no
            DOMContentLoaded/load. Espelha a detecção e as constantes do
            hook (qualquer Android; 4px de folga em dvh com fallback vh;
            pin em 2) — mudou lá, mudar aqui. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(!/Android/i.test(navigator.userAgent||''))return;var s=document.documentElement.style;s.minHeight='calc(100vh + 4px)';s.minHeight='calc(100dvh + 4px)';var pin=function(){if(window.scrollY<2)window.scrollTo(0,2);};pin();document.addEventListener('DOMContentLoaded',pin);window.addEventListener('load',pin);}catch(e){}})();`,
          }}
        />
        {/* Eruda: console de DevTools mobile, ativa so dentro do app nativo
            (Capacitor) pra debugar o WebView sem precisar de Mac/Safari
            Web Inspector. Toca no botao flutuante pra abrir o console. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function loadEruda(){if(window.__erudaLoaded)return;window.__erudaLoaded=true;var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/eruda';s.onload=function(){window.eruda&&window.eruda.init();};document.body.appendChild(s);}function check(){if(window.Capacitor){loadEruda();}}check();document.addEventListener('DOMContentLoaded',check);window.addEventListener('load',check);setTimeout(check,1000);})();`,
          }}
        />
      </head>
      <body>
        {/* AuthProvider envolve toda a árvore — substitui o `currentUser` global
            do vanilla por React Context. useAuth() é o consumer de qualquer
            client component que precise de session/user.
            QueryProvider fica DENTRO do AuthProvider pra que hooks que
            consomem ambos (useNotifications etc.) tenham acesso ao user no
            queryKey/enabled sem ordem de inicialização ambígua. */}
        <ServiceWorkerRegister />
        {/* Trava do pull-to-refresh nativo do wrapper Android (WebIntoApp):
            prende o documento em scrollY=1 pra que o SwipeRefreshLayout
            nunca arme o reload. No-op fora do WebView Android. */}
        <AndroidWebViewScrollPin />
        <AuthProvider>
          <QueryProvider>
            <DialogProvider>
              <AuthGateProvider>
                <StagingBanner />
                <EmailVerifyBanner />
                {/* Suspense exigido por useSearchParams() em ReferralCapture
                    quando renderiza em rotas dinâmicas. */}
                <Suspense fallback={null}>
                  <ReferralCapture />
                </Suspense>
                {children}
                <ToastViewport />
              </AuthGateProvider>
            </DialogProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
