// Next.js config — migração Path C do QueroUmaCor vanilla → Next.js+TS+React.
// Coexiste com o app vanilla em / durante a migração (deploy paralelo via
// Cloudflare Pages: pages.dev novo project OU subdomain app2.queroumacor.com.br).

import { withSentryConfig } from '@sentry/nextjs';

// Quando CAPACITOR_BUILD=true (build iOS/Android), exportamos como site
// estático (output: 'export') para que o Capacitor possa empacotar os
// arquivos localmente. rewrites() e headers() não são suportados nesse modo.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Static export para Capacitor (iOS/Android)
  ...(isCapacitorBuild && {
    output: 'export',
    distDir: 'out',
    images: { unoptimized: true },
  }),

  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      'https://uwqebaqweehiljsqkifm.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '',
    NEXT_PUBLIC_SENTRY_DSN:
      process.env.NEXT_PUBLIC_SENTRY_DSN ||
      process.env.SENTRY_DSN ||
      '',
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: false,
  },

  ...(!isCapacitorBuild && {
    async rewrites() {
      return [
        { source: '/api/v1/:path*', destination: '/api/:path*' },
        { source: '/portal', destination: '/portal/index.html' },
      ];
    },

    async headers() {
      const noCache = [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
      ];
      return [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
            { key: 'X-Frame-Options', value: 'DENY' },
          ],
        },
        { source: '/portal', headers: noCache },
        { source: '/portal/', headers: noCache },
        { source: '/portal/index.html', headers: noCache },
      ];
    },
  }),

  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'queroumacor.com.br', '*.queroumacor.com.br'] },
  },
};

export default withSentryConfig(nextConfig, {
  org: 'q87',
  project: 'queroumacor-app',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
