// Regressão de 2026-09-04: o Seu Zé dizia "Permissão de microfone negada" com
// a permissão do microfone CONCEDIDA na tela de permissões do app.
//
// Causa (Capacitor 6, BridgeWebChromeClient.onPermissionRequest): ao receber
// AUDIO_CAPTURE da WebView, o Capacitor pede DUAS permissões de uma vez —
// MODIFY_AUDIO_SETTINGS **e** RECORD_AUDIO — e só chama `request.grant()` se
// TODAS voltarem concedidas (o callback faz um AND sobre o Map de resultados).
// Permissão não declarada no Manifest é negada pelo sistema na hora, sem
// diálogo: faltava MODIFY_AUDIO_SETTINGS, o AND dava false, a WebView recusava
// e o getUserMedia rejeitava com NotAllowedError — enquanto os ajustes do
// Android mostravam o microfone ativo.
//
// Dois testes: o Manifest declara o par, e a mensagem de erro parou de
// afirmar uma causa que ela não verificou.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mensagemDeMicrofone } from '@/lib/hooks/useVoiceRecorder';

const MANIFEST = '../android/app/src/main/AndroidManifest.xml';

describe('Manifest: o par que a WebView exige pra liberar o microfone', () => {
  const xml = readFileSync(MANIFEST, 'utf8');

  it('declara RECORD_AUDIO e MODIFY_AUDIO_SETTINGS', () => {
    // As duas juntas ou nenhuma: com só uma, o AND do Capacitor nunca fecha e
    // o microfone é negado em silêncio, com a permissão "ativa" nos ajustes.
    expect(xml).toContain('android.permission.RECORD_AUDIO');
    expect(xml).toContain('android.permission.MODIFY_AUDIO_SETTINGS');
  });

  it('microfone segue como hardware OPCIONAL', () => {
    // Declarar RECORD_AUDIO faz o Play exigir microfone implicitamente e sumir
    // com o app de aparelhos sem um. Gravar voz é opcional — dá pra digitar.
    expect(xml).toMatch(
      /android\.hardware\.microphone"\s+android:required="false"/,
    );
  });
});

describe('a mensagem de microfone não afirma o que não verificou', () => {
  it('bloqueio não é declarado como "permissão negada"', () => {
    // A permissão do app pode estar concedida e mesmo assim a WebView recusar.
    // Mandar a pessoa "ativar a permissão" que já está ativa é o que fez este
    // bug parecer insolúvel do lado de quem usa.
    const msg = mensagemDeMicrofone(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    expect(msg).not.toMatch(/permiss(ã|a)o de microfone negada/i);
    expect(msg).toMatch(/ajustes|permitir/i);
  });

  it('sem microfone e microfone ocupado são causas DIFERENTES', () => {
    const semHardware = mensagemDeMicrofone(
      Object.assign(new Error(''), { name: 'NotFoundError' }),
    );
    const ocupado = mensagemDeMicrofone(
      Object.assign(new Error(''), { name: 'NotReadableError' }),
    );
    expect(semHardware).toMatch(/nenhum microfone/i);
    expect(ocupado).toMatch(/ocupado por outro app/i);
    expect(semHardware).not.toBe(ocupado);
  });

  it('causa desconhecida carrega o nome do erro em vez de chutar', () => {
    const msg = mensagemDeMicrofone(
      Object.assign(new Error(''), { name: 'InvalidStateError' }),
    );
    expect(msg).toContain('InvalidStateError');
  });

  it('rejeição sem `name` não quebra a mensagem', () => {
    expect(mensagemDeMicrofone(undefined)).toMatch(/microfone/i);
    expect(mensagemDeMicrofone('erro')).toMatch(/microfone/i);
  });
});
