// vitest.config.ts — config para os testes unitários do port Next.js.
// Restringe escopo a `__tests__/**` pra não pegar arquivos de outras camadas.
// Usa `jsdom` porque alguns helpers (utils.escapeHtml etc.) podem ser
// chamados em contexto de browser; por enquanto não precisamos de DOM mas
// deixar pronto evita ter que refatorar config quando portarmos componentes.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Plugin React: transforma o JSX dos testes de componente (.test.tsx).
  // O tsconfig do Next usa `jsx: 'preserve'` (o compilador do Next resolve),
  // então sem isto o esbuild do vitest entrega JSX cru e o arquivo quebra.
  plugins: [react()],
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**', '.next/**'],
    // Default node (a maioria dos testes é de lógica pura/serviços); testes
    // de componente escolhem jsdom via `// @vitest-environment jsdom`.
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': new URL('.', import.meta.url).pathname.replace(/\/$/, ''),
    },
  },
});
