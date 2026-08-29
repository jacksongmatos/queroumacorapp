// whatsapp-ai — travas do atendimento automático. O que mais importa aqui
// NÃO é a IA acertar o texto: é a REGRA DA LOJA (nunca preço, nunca
// orçamento) valer mesmo quando o modelo desobedece.
import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  clientAsksForPrice,
  isBusinessHour,
  isOptOut,
  replyLeaksPrice,
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
