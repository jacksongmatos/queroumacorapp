// robots.ts — FIX C2/M-P1 da auditoria 2026-08-26: o robots.txt da raiz do
// repo fica FORA do output do build do CF Pages, então produção respondia
// 404 em /robots.txt (Search Console verificado sem controle de crawl).
// Espelha o arquivo da raiz; gerado pelo App Router, entra no deploy sempre.

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/portal/', '/api/', '/admin/'],
      },
    ],
    sitemap: 'https://queroumacor.com.br/sitemap.xml',
  };
}
