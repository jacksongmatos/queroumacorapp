// @vitest-environment jsdom
//
// A regra que estes testes travam: a marca de "escolha pendente" só pode
// sobreviver quando o documento MORREU com o seletor aberto. Todo final
// normal — arquivo chegou, pessoa cancelou, seletor nem abriu — tem que
// apagar a marca. Se um deles vazar, o app passa a acusar "o app
// reiniciou" pra quem não teve problema nenhum, e o aviso perde o valor.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  JANELA_MS,
  armarSelecao,
  consumirEscolhaPendente,
  lerEscolhaPendente,
  limparEscolhaPendente,
  marcarEscolhaPendente,
} from '@/lib/utils/pickerRecovery';

const UA_ANDROID =
  'Dalvik/2.1.0 (Linux; U; Android 16; SM-S911B Build/UP1A.231005.007)';
const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120';

function esconder(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('marca de escolha pendente', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('grava e lê dentro da janela', () => {
    const t0 = 1_000_000;
    marcarEscolhaPendente('/publicar', 'publicar', t0);
    expect(lerEscolhaPendente(t0 + 1000)).toEqual({
      rota: '/publicar',
      ctx: 'publicar',
      em: t0,
    });
  });

  it('descarta marca fora da janela — sessão nova não é app morto', () => {
    const t0 = 1_000_000;
    marcarEscolhaPendente('/publicar', 'publicar', t0);
    expect(lerEscolhaPendente(t0 + JANELA_MS + 1)).toBeNull();
    // e não fica sujeira no aparelho
    expect(localStorage.length).toBe(0);
  });

  it('ler NÃO consome — quem consome é a tela dona', () => {
    const t0 = 1_000_000;
    marcarEscolhaPendente('/publicar', 'publicar', t0);
    expect(lerEscolhaPendente(t0)).not.toBeNull();
    expect(lerEscolhaPendente(t0)).not.toBeNull();
  });

  it('consumir só entrega pra tela do ctx certo', () => {
    const t0 = 1_000_000;
    marcarEscolhaPendente('/publicar', 'publicar', t0);
    // A tela errada não pode levar a marca embora…
    expect(consumirEscolhaPendente('perfil/editar', t0)).toBeNull();
    expect(lerEscolhaPendente(t0)).not.toBeNull();
    // …e a certa consome de vez.
    expect(consumirEscolhaPendente('publicar', t0)?.rota).toBe('/publicar');
    expect(lerEscolhaPendente(t0)).toBeNull();
  });

  it('sobrevive a JSON corrompido sem quebrar o boot', () => {
    localStorage.setItem('quc_pick_pendente_v1', '{lixo');
    expect(lerEscolhaPendente()).toBeNull();
  });
});

describe('armarSelecao', () => {
  beforeEach(() => {
    localStorage.clear();
    limparEscolhaPendente();
    vi.useFakeTimers();
  });

  it('marca ao abrir o seletor no Android', () => {
    armarSelecao({
      rota: '/publicar',
      ctx: 'publicar',
      userAgent: UA_ANDROID,
    });
    expect(lerEscolhaPendente()).not.toBeNull();
  });

  it('NÃO marca fora do Android — lá o processo não morre', () => {
    armarSelecao({
      rota: '/publicar',
      ctx: 'publicar',
      userAgent: UA_DESKTOP,
    });
    expect(lerEscolhaPendente()).toBeNull();
  });

  it('limpa a marca quando a pessoa VOLTA viva do seletor', () => {
    armarSelecao({
      rota: '/publicar',
      ctx: 'publicar',
      userAgent: UA_ANDROID,
    });
    esconder(true); // seletor abriu
    expect(lerEscolhaPendente()).not.toBeNull(); // ainda em risco
    esconder(false); // voltou — app não morreu
    expect(lerEscolhaPendente()).toBeNull();
  });

  it('a marca SOBREVIVE enquanto o seletor está aberto — é o caso a recuperar', () => {
    armarSelecao({
      rota: '/publicar',
      ctx: 'publicar',
      userAgent: UA_ANDROID,
    });
    esconder(true);
    vi.advanceTimersByTime(60_000); // app em segundo plano, sendo morto
    expect(lerEscolhaPendente()).not.toBeNull();
  });


  it('cancelar (arquivo chegou no change) limpa a marca', () => {
    const cancelar = armarSelecao({
      rota: '/publicar',
      ctx: 'publicar',
      userAgent: UA_ANDROID,
    });
    esconder(true);
    cancelar();
    expect(lerEscolhaPendente()).toBeNull();
  });

});
