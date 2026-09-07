// Serviços do orçamento (tile "Orçamento · Crie e envie") — a parte pura.
// O que precisa ficar travado:
//  - a linha NASCE com valor vazio e a sugestão da tabela do lado;
//  - as somas separam "o que a pessoa preencheu" de "o que a tabela sugere";
//  - o que foi gravado em quote_data volta igual, e lixo é descartado.

import { describe, it, expect } from 'vitest';
import type { PriceItem } from '@/lib/services/priceTable';
import {
  alturaDoAcesso,
  descreverServico,
  quantidadeDe,
  servicoAvulso,
  servicoDoItemDaTabela,
  servicosDoQuoteData,
  subtotalDoServico,
  subtotalSugerido,
  totaisDosServicos,
  valorUnitarioDe,
} from '@/lib/orcamentoServicos';

function item(over: Partial<PriceItem> = {}): PriceItem {
  return {
    id: 'pt-1',
    sheet_no: 4,
    category: 'Alvenarias e Paredes',
    grupo: 'Látex',
    tipo: 'Acrílico Premium',
    servico: 'Premium Fosco 3 demãos (m²)',
    observacao: null,
    altura: 'ate_3m',
    unidade: 'm2',
    preco_medio: 20.2,
    preco_min: 14.44,
    preco_max: 25.97,
    sort_order: 9,
    ...over,
  };
}

describe('servicoDoItemDaTabela', () => {
  it('nasce com valor VAZIO e a sugestão (mín/média/máx) do lado', () => {
    const s = servicoDoItemDaTabela(item(), 'a');
    expect(s.valorUnitario).toBe('');
    expect(s.quantidade).toBe('1');
    expect(s.priceItemId).toBe('pt-1');
    expect(s.unidade).toBe('m2');
    expect(s.sugestao).toEqual({ min: 14.44, medio: 20.2, max: 25.97 });
    expect(s.detalhe).toBe('Látex · Acrílico Premium · até 3 m');
  });

  it('item zerado no PDF (sem valor publicado) não vira sugestão de R$ 0', () => {
    const s = servicoDoItemDaTabela(item({ preco_medio: 0, preco_min: null, preco_max: null }), 'a');
    expect(s.sugestao).toBeNull();
    expect(subtotalSugerido(s)).toBeNull();
  });

  it('serviço avulso não tem sugestão nem item da tabela', () => {
    const s = servicoAvulso('Grafite no muro', 'x');
    expect(s.priceItemId).toBeNull();
    expect(s.sugestao).toBeNull();
    expect(s.valorUnitario).toBe('');
  });
});

describe('alturaDoAcesso', () => {
  it('térreo e escada caem em "até 3 m"; andaime e cadeira suspensa em "acima"', () => {
    expect(alturaDoAcesso('Térreo / sem altura')).toBe('ate_3m');
    expect(alturaDoAcesso('Escada (até 3m)')).toBe('ate_3m');
    expect(alturaDoAcesso('Andaime (3-6m)')).toBe('acima_3m');
    expect(alturaDoAcesso('Andaime alto / cadeira suspensa (acima 6m)')).toBe('acima_3m');
    expect(alturaDoAcesso('')).toBeNull();
    expect(alturaDoAcesso(null)).toBeNull();
  });
});

describe('contas por linha', () => {
  it('quantidade vazia/inválida vale 1; aceita vírgula', () => {
    const s = servicoDoItemDaTabela(item(), 'a');
    expect(quantidadeDe(s)).toBe(1);
    expect(quantidadeDe({ ...s, quantidade: '' })).toBe(1);
    expect(quantidadeDe({ ...s, quantidade: 'abc' })).toBe(1);
    expect(quantidadeDe({ ...s, quantidade: '0' })).toBe(1);
    expect(quantidadeDe({ ...s, quantidade: '12,5' })).toBe(12.5);
  });

  it('valor vazio é null (não é zero) e o subtotal também', () => {
    const s = servicoDoItemDaTabela(item(), 'a');
    expect(valorUnitarioDe(s)).toBeNull();
    expect(subtotalDoServico(s)).toBeNull();
    // A sugestão continua disponível pra mostrar ao lado.
    expect(subtotalSugerido({ ...s, quantidade: '80' })).toBe(1616);
  });

  it('aceita "1.500,50" e "1500.50" no valor unitário (regra do parseBRL)', () => {
    const s = servicoDoItemDaTabela(item(), 'a');
    expect(valorUnitarioDe({ ...s, valorUnitario: '1.500,50' })).toBe(1500.5);
    expect(valorUnitarioDe({ ...s, valorUnitario: '1500.50' })).toBe(1500.5);
    expect(valorUnitarioDe({ ...s, valorUnitario: 'R$ 22' })).toBe(22);
    expect(subtotalDoServico({ ...s, valorUnitario: '22', quantidade: '80' })).toBe(1760);
  });

  it('subtotal arredonda a centavo (sem 269.70000000000005)', () => {
    const s = servicoDoItemDaTabela(item(), 'a');
    expect(subtotalDoServico({ ...s, valorUnitario: '0,1', quantidade: '3' })).toBe(0.3);
  });
});

describe('totaisDosServicos', () => {
  it('separa o preenchido do sugerido e conta o que falta', () => {
    const a = { ...servicoDoItemDaTabela(item(), 'a'), quantidade: '80', valorUnitario: '22' };
    const b = { ...servicoDoItemDaTabela(item({ id: 'pt-2', preco_medio: 10 }), 'b'), quantidade: '10' };
    const c = servicoAvulso('Retoque', 'c');
    const t = totaisDosServicos([a, b, c]);
    expect(t.preenchido).toBe(1760); // só a
    expect(t.sugerido).toBe(1760 + 100); // a (digitado) + b (média 10 × 10); c não tem pista
    expect(t.semValor).toBe(2);
    expect(t.semSugestao).toBe(1);
  });

  it('lista vazia zera tudo', () => {
    expect(totaisDosServicos([])).toEqual({ preenchido: 0, sugerido: 0, semValor: 0, semSugestao: 0 });
  });
});

describe('descreverServico', () => {
  it('sem valor diz "a definir" em vez de inventar número', () => {
    const s = { ...servicoDoItemDaTabela(item(), 'a'), quantidade: '80' };
    expect(descreverServico(s)).toBe('Premium Fosco 3 demãos (m²) — 80 m² (valor a definir)');
  });

  it('com valor mostra a conta inteira', () => {
    const s = { ...servicoDoItemDaTabela(item(), 'a'), quantidade: '80', valorUnitario: '22' };
    expect(descreverServico(s)).toBe('Premium Fosco 3 demãos (m²) — 80 m² × R$ 22,00 = R$ 1.760,00');
  });
});

describe('servicosDoQuoteData', () => {
  it('devolve o que foi gravado e descarta lixo', () => {
    const gravado = [
      servicoDoItemDaTabela(item(), 'a'),
      { servico: '' }, // sem nome → fora
      null,
      'texto solto',
      { servico: 'Avulso ok', quantidade: 2, valorUnitario: 150 }, // números viram texto
      { servico: 'Sugestão inválida', sugestao: { medio: 'abc' } },
    ];
    const lidos = servicosDoQuoteData({ servicos: gravado, warranty: '90 dias' });
    expect(lidos).toHaveLength(3);
    expect(lidos[0]!.sugestao).toEqual({ min: 14.44, medio: 20.2, max: 25.97 });
    expect(lidos[1]).toMatchObject({ servico: 'Avulso ok', quantidade: '2', valorUnitario: '150', unidade: 'unidade' });
    expect(lidos[2]!.sugestao).toBeNull();
  });

  it('quote_data sem a chave, nulo ou de formato antigo → lista vazia', () => {
    expect(servicosDoQuoteData(null)).toEqual([]);
    expect(servicosDoQuoteData({ warranty: 'x' })).toEqual([]);
    expect(servicosDoQuoteData({ servicos: 'não é lista' })).toEqual([]);
    expect(servicosDoQuoteData({ itens: [{ desc: 'legado', valor: 'R$ 1' }] })).toEqual([]);
  });

  it('aceita a lista direto (ida e volta com os totais iguais)', () => {
    const lista = [{ ...servicoDoItemDaTabela(item(), 'a'), quantidade: '80', valorUnitario: '22' }];
    const volta = servicosDoQuoteData(JSON.parse(JSON.stringify(lista)));
    expect(totaisDosServicos(volta)).toEqual(totaisDosServicos(lista));
  });
});
