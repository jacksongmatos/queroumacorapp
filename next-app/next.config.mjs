// Next.js config — migração Path C do QueroUmaCor vanilla → Next.js+TS+React.
// Coexiste com o app vanilla em / durante a migração (deploy paralelo via
// Cloudflare Pages: pages.dev novo project OU subdomain app2.queroumacor.com.br).

import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

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
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://*.sentry-cdn.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.onrender.com https://challenges.cloudflare.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://sentry.io https://*.sentry.io https://cdn.jsdelivr.net https://storage.googleapis.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests" },
          { key: 'Permissions-Policy', value: "microphone=(self), camera=(self), geolocation=(self), payment=(self), accelerometer=(), gyroscope=(), magnetometer=(), usb=()" },
        ],
      },
      { source: '/portal', headers: noCache },
      { source: '/portal/', headers: noCache },
      { source: '/portal/index.html', headers: noCache },
    ];
  },

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
