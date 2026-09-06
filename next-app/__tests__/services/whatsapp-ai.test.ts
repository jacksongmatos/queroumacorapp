// whatsapp-ai — travas do atendimento automático. O que mais importa aqui
// NÃO é a IA acertar o texto: é a REGRA DA LOJA (nunca preço, nunca
// orçamento) valer mesmo quando o modelo desobedece.
import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  clientAsksForPrice,
  diaBrt,
  isBusinessHour,
  isOptOut,
  ehRecusaDeAbordagem,
  textoRecusaAgradecida,
  replyLeaksPrice,
  shouldSendAway,
  textoAusencia,
} from '../../lib/api/_services/whatsapp-ai';

describe('clientAsksForPrice — pedido do CLIENTE escala antes de chamar a IA', () => {
  it('detecta pedido de preço em várias formas', () => {
    ['Quanto custa?', 'qual o valor do galão', 'Me passa a tabela de preço',
     'tem desconto?', 'da pra parcelar?', 'quanto fica 18L', 'qual a forma de pagamento',
     'faz por quanto à vista'].forEach((t) => {
      expect(clientAsksForPrice(t), t).toBe('preco');
    });
  });

  it('detecta pedido de orçamento', () => {
    ['Pode fazer um orçamento?', 'preciso de um orcamento pra fachada', 'me orça aí'].forEach(
      (t) => expect(clientAsksForPrice(t), t).toBe('orcamento'),
    );
  });

  it('não escala conversa normal', () => {
    ['Bom dia!', 'Vocês têm tinta branca?', 'Onde fica a loja?',
     'Trabalham com epóxi?', 'Que horas abre?'].forEach((t) => {
      expect(clientAsksForPrice(t), t).toBeNull();
    });
  });
});

describe('replyLeaksPrice — trava final na SAÍDA da IA', () => {
  it('barra resposta com R$ ou reais', () => {
    expect(replyLeaksPrice('O galão sai R$ 189,90')).toBe(true);
    expect(replyLeaksPrice('custa 250 reais')).toBe(true);
  });

  it('barra número em contexto de dinheiro sem R$', () => {
    expect(replyLeaksPrice('esse custa 120')).toBe(true);
    expect(replyLeaksPrice('sai por 89,90 no pix')).toBe(true);
    expect(replyLeaksPrice('a partir de 70')).toBe(true);
  });

  it('barra promessa de orçamento fechado', () => {
    expect(replyLeaksPrice('Segue o orçamento completo abaixo')).toBe(true);
    expect(replyLeaksPrice('o valor total ficou fechado')).toBe(true);
  });

  it('deixa passar resposta legítima com número que NÃO é dinheiro', () => {
    expect(replyLeaksPrice('Temos o galão de 3,6L e a lata de 18L')).toBe(false);
    expect(replyLeaksPrice('Abrimos das 8h às 18h')).toBe(false);
    expect(replyLeaksPrice('Trabalhamos com acrílico e látex, sim!')).toBe(false);
  });
});

describe('isBusinessHour — horário de Brasília', () => {
  const utc = (iso: string) => new Date(iso);
  it('dentro do horário em dia útil', () => {
    // 2026-08-27 é quinta. 13:00 UTC = 10:00 Brasília.
    expect(isBusinessHour(utc('2026-08-27T13:00:00Z'))).toBe(true);
    expect(isBusinessHour(utc('2026-08-27T11:00:00Z'))).toBe(true); // 08:00 BRT
  });
  it('fora do horário', () => {
    expect(isBusinessHour(utc('2026-08-27T05:00:00Z'))).toBe(false); // 02:00 BRT
    expect(isBusinessHour(utc('2026-08-27T23:00:00Z'))).toBe(false); // 20:00 BRT
  });
  it('domingo nunca responde', () => {
    // 2026-08-30 é domingo. 15:00 UTC = 12:00 BRT.
    expect(isBusinessHour(utc('2026-08-30T15:00:00Z'))).toBe(false);
  });
});

describe('diaBrt — o "dia" do teto de respostas é o de Brasília', () => {
  it('23h de Brasília ainda é o MESMO dia (com UTC cru já teria virado)', () => {
    // 2026-08-29T02:54Z = 28/08 23:54 em Brasília.
    expect(diaBrt(new Date('2026-08-29T02:54:00Z'))).toBe('2026-08-28');
  });
  it('vira à meia-noite daqui, não às 21h', () => {
    expect(diaBrt(new Date('2026-08-29T02:59:00Z'))).toBe('2026-08-28'); // 23:59 BRT
    expect(diaBrt(new Date('2026-08-29T03:01:00Z'))).toBe('2026-08-29'); // 00:01 BRT
  });
});

describe('isOptOut', () => {
  it('respeita PARE e variações', () => {
    ['PARE', 'pare', 'parar', 'Sair', 'não quero', 'stop'].forEach((t) =>
      expect(isOptOut(t), t).toBe(true),
    );
  });
  it('não confunde com conversa normal', () => {
    expect(isOptOut('parece bom')).toBe(false);
    expect(isOptOut('quero sim')).toBe(false);
  });
});

describe('mensagem de ausência — quando a IA não vai responder', () => {
  const NOW = new Date('2026-08-29T17:00:00Z');
  const hAtras = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

  it('se apresenta, agradece e promete retorno — sem falar preço', () => {
    const t = textoAusencia({ motivo: 'horario', janela: { start: 8, end: 19 } });
    expect(t).toContain('Cali Colors');
    expect(t).toContain('Obrigado pelo seu contato');
    expect(t).toContain('em breve');
    expect(t).toContain('das 8h às 19h');
    expect(replyLeaksPrice(t)).toBe(false);
  });

  it('com a chave desligada não inventa horário de atendimento', () => {
    const t = textoAusencia({ motivo: 'desligada' });
    expect(t).not.toMatch(/\dh às \dh/);
    expect(t).toContain('em breve');
    expect(replyLeaksPrice(t)).toBe(false);
  });

  it('texto customizado do portal manda mais que o padrão', () => {
    expect(textoAusencia({ motivo: 'horario', custom: 'Voltamos amanhã!' })).toBe('Voltamos amanhã!');
  });

  it('manda quando a conversa está fria', () => {
    expect(shouldSendAway({ now: NOW })).toBe(true);
    expect(shouldSendAway({ awayAt: hAtras(20), now: NOW })).toBe(true);
  });

  it('NÃO repete dentro de 12h', () => {
    expect(shouldSendAway({ awayAt: hAtras(3), now: NOW })).toBe(false);
  });

  it('NÃO atropela pessoa que respondeu agora há pouco', () => {
    expect(shouldSendAway({ lastHumanOutAt: hAtras(1), now: NOW })).toBe(false);
    expect(shouldSendAway({ lastHumanOutAt: hAtras(5), now: NOW })).toBe(true);
  });

  it('NUNCA vai pra quem pediu PARE', () => {
    expect(shouldSendAway({ optedOut: true, now: NOW })).toBe(false);
  });
});

describe('buildSystemPrompt', () => {
  it('inclui as regras duras e o contexto do lead', () => {
    const p = buildSystemPrompt({
      lead: { name: 'DNA Bodyshop', category: 'Funilaria/Auto', city: 'Guarulhos' },
      produtos: ['Primer PU 3,6L', 'Verniz HS 5L'],
    });
    expect(p).toContain('NUNCA informe preço');
    expect(p).toContain('NUNCA faça orçamento');
    expect(p).toContain('DNA Bodyshop');
    expect(p).toContain('Funilaria/Auto');
    expect(p).toContain('Primer PU 3,6L');
    expect(p).toContain('precisa_humano');
  });

  it('funciona sem lead e sem produtos', () => {
    const p = buildSystemPrompt({});
    expect(p).toContain('Cali Colors');
    expect(p).not.toContain('undefined');
  });

  it('PRIMEIRO CONTATO manda recepcionar antes de responder', () => {
    const p = buildSystemPrompt({ primeiroContato: true });
    expect(p).toContain('PRIMEIRA MENSAGEM DA CONVERSA');
    expect(p).toContain('cumprimente');
    expect(p).toContain('loja de tintas em Guarulhos');
    expect(p).toContain('agradeça o contato');
    expect(p).toContain('nunca robótico');
  });

  it('com pendência aberta, manda NÃO repetir a promessa e seguir ajudando', () => {
    const p = buildSystemPrompt({ pendenciaAberta: true });
    expect(p).toContain('NÃO repita essa promessa');
    expect(p).toContain('Siga atendendo normalmente');
    expect(p).toContain('sem prometer prazo');
  });

  it('sem pendência, não fala em promessa nenhuma', () => {
    const p = buildSystemPrompt({});
    expect(p).not.toContain('NÃO repita essa promessa');
  });

  it('conversa já em andamento NÃO repete a apresentação', () => {
    const p = buildSystemPrompt({ primeiroContato: false });
    expect(p).not.toContain('PRIMEIRA MENSAGEM DA CONVERSA');
    expect(p).toContain('No máximo 3 frases curtas');
  });
});

// ── "Não tenho interesse" (quick reply do template) ─────────────────────
describe('ehRecusaDeAbordagem', () => {
  it('reconhece o rótulo do botão', () => {
    expect(ehRecusaDeAbordagem('Não tenho interesse')).toBe(true);
  });

  // O rótulo é editado no painel da Meta: pode voltar sem acento, em outra
  // caixa ou com ponto, e ninguém aqui ficaria sabendo.
  it('não depende de acento, caixa ou pontuação', () => {
    for (const t of [
      'nao tenho interesse',
      'NÃO TENHO INTERESSE',
      '  Não tenho interesse.  ',
      'Sem interesse',
      'não me interessa',
    ]) {
      expect(ehRecusaDeAbordagem(t), t).toBe(true);
    }
  });

  it('não confunde com quem está conversando', () => {
    for (const t of [
      'tenho interesse',
      'tenho interesse sim',
      'me interessa muito',
      'qual o preço?',
      '',
      'não tenho interesse em tinta acrílica, quero esmalte',
    ]) {
      expect(ehRecusaDeAbordagem(t), t).toBe(false);
    }
  });

  it('é separado do PARE — os dois calam, mas o desfecho difere', () => {
    expect(isOptOut('Não tenho interesse')).toBe(false);
    expect(ehRecusaDeAbordagem('PARE')).toBe(false);
  });
});

describe('textoRecusaAgradecida', () => {
  const texto = textoRecusaAgradecida();

  it('é curto — quem disse não não vai ler parágrafo', () => {
    expect(texto.length).toBeLessThan(200);
  });

  it('não fala preço (a regra da loja vale aqui também)', () => {
    expect(replyLeaksPrice(texto)).toBe(false);
  });

  it('não anuncia o PARE (decisão da loja, 29/08)', () => {
    expect(texto).not.toMatch(/\bPARE\b/);
  });
});
