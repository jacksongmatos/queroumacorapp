// A linha de digitar dos assistentes não pode ser mais larga que a tela.
//
// Sintoma que o usuário viu (2026-09-05): ao abrir a Alice num celular
// estreito, o ícone de mensagem do topo aparecia CORTADO pela direita.
//
// A causa não estava no topo. O `TopNav` é `sticky`, não `fixed` — então
// ele tem a largura do CONTAINER, não da janela. Quando algum filho da
// página é mais largo que o viewport, o container estica e a barra vai
// junto; o que sai da tela é a ponta direita dela.
//
// O filho largo era a linha do campo de digitar:
//
//   <textarea class="flex-1">  +  🎤 (44px)  +  [Enviar]
//
// Item de flex NÃO encolhe abaixo da largura intrínseca sem `min-w-0`, e
// `<textarea>` tem intrínseca alta (cols=20 ≈ 190px). Somando o microfone,
// o botão, os gaps e os paddings, a linha passava de 360px.
//
// O CLAUDE.md já registrava esse mesmo padrão em outro lugar (comentário do
// feed, 2026-09-01: "precisou de `minWidth: 0` por ser flex item"). Aqui
// ele virou teste, porque são QUATRO telas clonadas — corrigir uma e
// esquecer as outras é o modo de falha natural.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TELAS = [
  ['Alice', 'app/alice/AliceChat.tsx'],
  ['Seu Zé', 'app/seu-ze/SeuZeChat.tsx'],
  ['Fê', 'app/fe/FeChat.tsx'],
  ['Senna', 'app/senna/SennaChat.tsx'],
] as const;

function fonte(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('linha de digitar dos assistentes não estoura a largura', () => {
  for (const [nome, arquivo] of TELAS) {
    it(`${nome}: o campo pode encolher (min-w-0)`, () => {
      const src = fonte(arquivo);
      const linha = src
        .split('\n')
        .find((l) => l.includes('flex-1') && l.includes('resize-none'));
      expect(linha, `${arquivo}: não achei a classe do textarea`).toBeTruthy();
      expect(
        linha,
        `${arquivo}: textarea com flex-1 SEM min-w-0 — ele não encolhe e ` +
          'empurra a linha pra fora da tela'
      ).toContain('min-w-0');
    });

    it(`${nome}: o botão de enviar não é espremido (shrink-0)`, () => {
      const src = fonte(arquivo);
      const i = src.indexOf('type="submit"');
      expect(i, `${arquivo}: não achei o botão de enviar`).toBeGreaterThan(-1);
      // A classe vem logo depois do type="submit".
      const trecho = src.slice(i, i + 400);
      expect(
        trecho,
        `${arquivo}: botão de enviar sem shrink-0 — vira "En…" quando aperta`
      ).toContain('shrink-0');
    });
  }

  it('o microfone não é espremido (é compartilhado pelas quatro telas)', () => {
    const src = fonte('app/seu-ze/VoiceRecorder.tsx');
    const linha = src
      .split('\n')
      .find((l) => l.includes('flex flex-col items-stretch'));
    expect(linha).toBeTruthy();
    expect(linha, 'VoiceRecorder sem shrink-0 — o círculo deforma').toContain(
      'shrink-0'
    );
  });
});
