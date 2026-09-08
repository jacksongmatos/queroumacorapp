// Prompt da IA editável no portal (2026-09-08).
//
// O portal é arquivo único sem módulos; este teste trava o CONTRATO no
// fonte: onde o texto é gravado, de onde vem o padrão e que a tela avisa
// o SQL quando a coluna ainda não existe. A regra de negócio (o texto do
// portal substitui a base e o rabo fixo continua) é testada do lado do
// servidor em __tests__/services/whatsapp-ai.test.ts.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let fonte = '';
beforeAll(() => {
  fonte = readFileSync(join(process.cwd(), 'public/portal/app.jsx'), 'utf8');
});

describe('prompt da IA editável no portal', () => {
  it('grava em whatsapp_ai_config.prompt e NULL quando igual ao padrão', () => {
    expect(fonte).toContain("const valor = igualAoPadrao || !texto.trim() ? null : texto;");
    expect(fonte).toMatch(/from\('whatsapp_ai_config'\)\s*\.upsert\(\{ id:1, prompt: valor/);
  });

  it('o padrão vem da rota, não de cópia no portal', () => {
    expect(fonte).toContain("fetch('/api/whatsapp/ai-prompt'");
    expect(existsSync(join(process.cwd(), 'app/api/whatsapp/ai-prompt/route.ts'))).toBe(true);
    expect(fonte).not.toContain('REGRAS ABSOLUTAS');
  });

  it('a leitura do prompt é separada da leitura da config (coluna pode não existir)', () => {
    expect(fonte).toMatch(/from\('whatsapp_ai_config'\)\.select\('prompt'\)/);
    expect(fonte).not.toMatch(/select\('hours, [^']*prompt/);
  });

  it('coluna ausente vira instrução com o SQL, não erro mudo', () => {
    expect(fonte).toContain("ALTER TABLE public.whatsapp_ai_config ADD COLUMN IF NOT EXISTS prompt text;");
    expect(fonte).toContain('Rode no SQL Editor do Supabase');
  });

  it('botão na barra + item na ajuda (botão novo ali = item novo na lista)', () => {
    expect(fonte).toContain('🧠 Prompt da IA{typeof promptIa');
    expect(fonte).toMatch(/AJUDA_WHATSAPP = \[[\s\S]*t:'🧠 Prompt da IA'/);
  });
});
