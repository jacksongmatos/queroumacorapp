// Regra do projeto (CLAUDE.md, 2026-08-22): "Ler sempre por `getRuntimeEnv()`,
// nunca `process.env` direto, pra qualquer secret/config de runtime."
//
// Motivo: no edge do Cloudflare os secrets do painel do Pages NÃO chegam em
// `process.env` — vivem no contexto da request. Foi assim que o portal admin
// quebrou em produção com as envs perfeitamente configuradas.
//
// A auditoria de 01/09/2026 achou 57 violações vivas em 38 arquivos,
// cobrindo TODA a camada de IA (legenda, transcrição, TTS, moderação,
// análise financeira, OCR, arte-IG) e os pagamentos (checkout, mp-webhook).
// Este teste existe pra isso não voltar em silêncio: é regra de arquitetura,
// e regra que ninguém verifica é sugestão.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Envs que PODEM ser lidas direto: o Next as substitui no build. */
const PERMITIDAS = /^(NODE_ENV|NEXT_PHASE|VITEST|VITEST_WORKER_ID|NEXT_PUBLIC_[A-Z0-9_]+)$/;

/** `env.ts` é a implementação do helper; é onde o fallback mora. */
const ISENTOS = ['lib/api/env.ts', 'lib/api/admin-config.ts'];

function varrer(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      varrer(caminho, achados);
    } else if (caminho.endsWith('.ts') || caminho.endsWith('.tsx')) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe('regra: secret de runtime não se lê em process.env', () => {
  it('nenhuma leitura crua sobrou em lib/api e app/api', () => {
    const arquivos = [...varrer('lib/api'), ...varrer('app/api')];
    const violacoes: string[] = [];

    for (const arquivo of arquivos) {
      if (ISENTOS.some((i) => arquivo.endsWith(i))) continue;
      const linhas = readFileSync(arquivo, 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        for (const m of linha.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
          if (!PERMITIDAS.test(m[1])) {
            violacoes.push(`${arquivo}:${i + 1} → ${m[1]}`);
          }
        }
      });
    }

    expect(violacoes).toEqual([]);
  });
});
