// whatsapp-followup — a varredura que cutuca pendência esquecida e
// reengaja cliente sumido. O que importa aqui é NÃO incomodar quem não
// deve: quem pediu PARE, a conversa que o operador assumiu, e ninguém
// duas vezes pela mesma coisa.
import { describe, expect, it } from 'vitest';
import { replyLeaksPrice } from '../../lib/api/_services/whatsapp-ai';
import {
  MAX_SENDS_PER_SWEEP,
  planFollowups,
  snapshotFromMessages,
  textoCobranca,
  textoReengajamento,
  tituloBase,
  tituloEspera,
  type ConvSnapshot,
  type SweepConfig,
} from '../../lib/api/_services/whatsapp-followup';

const NOW = new Date('2026-08-29T17:00:00Z'); // 14:00 BRT, dia útil
const hAtras = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

const CFG: SweepConfig = { followupOn: true, followupHours: 3, nudgeHours: 48, podeEnviar: true };

function conv(over: Partial<ConvSnapshot>): ConvSnapshot {
  return {
    waId: '5511999999999',
    lastMsgAt: hAtras(1),
    lastMsgDirection: 'in',
    lastHumanOutAt: null,
    ...over,
  };
}

describe('planFollowups — pendência esquecida', () => {
  const comAlerta = (horas: number, over: Partial<ConvSnapshot> = {}) =>
    conv({
      lastMsgAt: hAtras(horas),
      alert: { id: 'a1', createdAt: hAtras(horas), title: 'Cliente pediu PREÇO', followedUpAt: null },
      ...over,
    });

  it('alerta + cobra o cliente quando ninguém respondeu', () => {
    const acoes = planFollowups([comAlerta(5)], CFG, NOW);
    expect(acoes.map((a) => a.kind)).toEqual(['alerta', 'cobranca']);
  });

  it('não faz nada antes do prazo', () => {
    expect(planFollowups([comAlerta(1)], CFG, NOW)).toEqual([]);
  });

  it('cala quando um HUMANO já respondeu depois do alerta', () => {
    const c = comAlerta(5, { lastHumanOutAt: hAtras(2) });
    expect(planFollowups([c], CFG, NOW)).toEqual([]);
  });

  it('resposta humana ANTERIOR ao alerta não conta', () => {
    const c = comAlerta(5, { lastHumanOutAt: hAtras(9) });
    expect(planFollowups([c], CFG, NOW).map((a) => a.kind)).toContain('alerta');
  });

  it('cobra o cliente UMA vez só (segunda varredura só atualiza o alerta)', () => {
    const c = comAlerta(9, {
      alert: { id: 'a1', createdAt: hAtras(9), title: 'Cliente pediu PREÇO', followedUpAt: hAtras(4) },
    });
    expect(planFollowups([c], CFG, NOW).map((a) => a.kind)).toEqual(['alerta']);
  });

  it('fora do horário, só o alerta interno — cliente não recebe nada', () => {
    const acoes = planFollowups([comAlerta(5)], { ...CFG, podeEnviar: false }, NOW);
    expect(acoes.map((a) => a.kind)).toEqual(['alerta']);
  });
});

describe('planFollowups — cliente sumido', () => {
  const sumido = (horas: number, over: Partial<ConvSnapshot> = {}) =>
    conv({ lastMsgAt: hAtras(horas), lastMsgDirection: 'out', ...over });

  it('reengaja depois do prazo de silêncio', () => {
    expect(planFollowups([sumido(50)], CFG, NOW).map((a) => a.kind)).toEqual(['reengajamento']);
  });

  it('espera o prazo', () => {
    expect(planFollowups([sumido(10)], CFG, NOW)).toEqual([]);
  });

  it('não fala com quem escreveu por último (a bola é da loja)', () => {
    expect(planFollowups([conv({ lastMsgAt: hAtras(50), lastMsgDirection: 'in' })], CFG, NOW)).toEqual([]);
  });

  it('não repete o toque dentro da semana', () => {
    const c = sumido(50, { state: { optedOut: false, enabled: null, followupAt: hAtras(24) } });
    expect(planFollowups([c], CFG, NOW)).toEqual([]);
  });

  it('volta a poder cutucar depois da semana', () => {
    const c = sumido(50, { state: { optedOut: false, enabled: null, followupAt: hAtras(24 * 8) } });
    expect(planFollowups([c], CFG, NOW).map((a) => a.kind)).toEqual(['reengajamento']);
  });

  it('conversa fria (mais de 30 dias) fica quieta', () => {
    expect(planFollowups([sumido(24 * 40)], CFG, NOW)).toEqual([]);
  });
});

describe('planFollowups — quem NUNCA recebe', () => {
  it('quem pediu PARE', () => {
    const c = conv({
      lastMsgAt: hAtras(50),
      lastMsgDirection: 'out',
      state: { optedOut: true, enabled: false, followupAt: null },
      alert: { id: 'a1', createdAt: hAtras(50), title: 'Cliente pediu PARE', followedUpAt: null },
    });
    expect(planFollowups([c], CFG, NOW)).toEqual([]);
  });

  it('conversa em que o operador desligou a chave na mão', () => {
    const c = conv({
      lastMsgAt: hAtras(50),
      lastMsgDirection: 'out',
      state: { optedOut: false, enabled: false, followupAt: null },
    });
    expect(planFollowups([c], CFG, NOW)).toEqual([]);
  });

  it('chave nunca decidida (null) segue o padrão global e RECEBE', () => {
    const c = conv({
      lastMsgAt: hAtras(50),
      lastMsgDirection: 'out',
      state: { optedOut: false, enabled: null, followupAt: null },
    });
    expect(planFollowups([c], CFG, NOW).map((a) => a.kind)).toEqual(['reengajamento']);
  });

  it('ninguém, quando a varredura está desligada no portal', () => {
    const c = conv({ lastMsgAt: hAtras(50), lastMsgDirection: 'out' });
    expect(planFollowups([c], { ...CFG, followupOn: false }, NOW)).toEqual([]);
  });
});

describe('planFollowups — teto de envios', () => {
  it('nunca passa de MAX_SENDS_PER_SWEEP mensagens, priorizando as recentes', () => {
    const convs = Array.from({ length: 25 }, (_, i) =>
      conv({ waId: `551199999${String(i).padStart(4, '0')}`, lastMsgAt: hAtras(50 + i), lastMsgDirection: 'out' }),
    );
    const acoes = planFollowups(convs, CFG, NOW);
    expect(acoes).toHaveLength(MAX_SENDS_PER_SWEEP);
    // A mais recente (i=0, 50h) entrou; a mais fria (i=24) ficou de fora.
    expect(acoes[0].waId).toBe('5511999990000');
    expect(acoes.some((a) => a.waId === '5511999990024')).toBe(false);
  });
});

describe('título do alerta', () => {
  it('não empilha o sufixo de espera a cada varredura', () => {
    const t1 = tituloEspera('Cliente pediu PREÇO', 4);
    const t2 = tituloEspera(t1, 9);
    expect(t2).toBe('⏰ Cliente pediu PREÇO · sem resposta há 9h');
  });
  it('limpa também o sufixo em minutos que o runner grava', () => {
    expect(tituloBase('Cliente pediu PREÇO · aguardando há 12 min')).toBe('Cliente pediu PREÇO');
  });
  it('vira dias depois de 24h', () => {
    expect(tituloEspera('Cliente pediu ORÇAMENTO', 50)).toContain('há 2d');
  });
});

describe('mensagens automáticas', () => {
  it('NENHUMA fala de preço (regra da loja, checada com a mesma trava da IA)', () => {
    expect(replyLeaksPrice(textoCobranca('Bruno'))).toBe(false);
    expect(replyLeaksPrice(textoReengajamento('Bruno'))).toBe(false);
  });
  it('usa só o primeiro nome, e funciona sem nome', () => {
    expect(textoCobranca('Bruno Silva Andrade')).toContain('Oi Bruno!');
    expect(textoCobranca(null)).toContain('Oi!');
    expect(textoReengajamento(null)).toContain('Oi, tudo bem?');
  });
  it('o reengajamento oferece a saída (PARE)', () => {
    expect(textoReengajamento('Ana')).toContain('PARE');
  });
});

describe('snapshotFromMessages', () => {
  const row = (over: Partial<Parameters<typeof snapshotFromMessages>[0][0]>) => ({
    wa_id: '5511999999999',
    direction: 'in',
    sent_by: null,
    profile_name: null,
    created_at: hAtras(5),
    ...over,
  });

  it('separa resposta de GENTE (sent_by) da resposta da IA (sent_by null)', () => {
    const m = snapshotFromMessages([
      row({ created_at: hAtras(5) }),
      row({ direction: 'out', created_at: hAtras(4) }), // IA
      row({ direction: 'out', sent_by: 'admin-uuid', created_at: hAtras(3) }), // pessoa
      row({ direction: 'out', created_at: hAtras(2) }), // IA de novo
    ]);
    const c = m.get('5511999999999')!;
    expect(c.lastHumanOutAt).toBe(hAtras(3));
    expect(c.lastMsgAt).toBe(hAtras(2));
    expect(c.lastMsgDirection).toBe('out');
  });

  it('agrupa por número e guarda o nome do WhatsApp', () => {
    const m = snapshotFromMessages([
      row({ profile_name: 'Bruno' }),
      row({ wa_id: '5511888888888', created_at: hAtras(1) }),
    ]);
    expect(m.size).toBe(2);
    expect(m.get('5511999999999')!.nome).toBe('Bruno');
  });
});
