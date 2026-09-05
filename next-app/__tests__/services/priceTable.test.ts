// Testes da Tabela de Preços da ABRAPP. Cobrem só a parte pura — busca,
// filtro, agrupamento e a conta de quantidade. O fetch depende do Supabase e
// é coberto pelo caminho de erro no service (42P01 → lista vazia).

import { describe, it, expect } from 'vitest';
import {
  agruparPorCategoria,
  filtrarPrecos,
  listarCategorias,
  normalizarBusca,
  rotuloAltura,
  semValorPublicado,
  totalPara,
  unidadeCurta,
  unidadeLonga,
  type PriceItem,
} from '@/lib/services/priceTable';

function item(over: Partial<PriceItem> = {}): PriceItem {
  return {
    id: Math.random().toString(36).slice(2),
    sheet_no: 4,
    category: 'Alvenarias e Paredes',
    grupo: 'Látex',
    tipo: 'Acrílico Premium e Acrílico Super Premium',
    servico: 'Premium Fosco 3 demãos (m²)',
    observacao: 'até 3 metros altura',
    altura: 'ate_3m',
    unidade: 'm2',
    preco_medio: 20.2,
    preco_min: 14.44,
    preco_max: 25.97,
    sort_order: 9,
    ...over,
  };
}

describe('normalizarBusca', () => {
  it('tira acento e caixa', () => {
    expect(normalizarBusca('  Impermeabilização ')).toBe('impermeabilizacao');
    expect(normalizarBusca('MÁXIMO')).toBe('maximo');
  });
});

describe('filtrarPrecos', () => {
  it('acha sem acento o que está escrito com acento', () => {
    const base = [item({ servico: 'Manta Liquida Fria Emborrachada Flexível (3 demãos)' })];
    expect(filtrarPrecos(base, { q: 'flexivel' })).toHaveLength(1);
  });

  it('exige TODOS os termos, não qualquer um', () => {
    const base = [
      item({ servico: 'Premium Fosco 3 demãos (m²)' }),
      item({ servico: 'Standard Fosco 2 demãos (m²)', tipo: 'Acrílico Standard' }),
    ];
    // Com OU, "premium fosco" devolveria os dois (os dois têm "fosco").
    const achados = filtrarPrecos(base, { q: 'premium fosco' });
    expect(achados).toHaveLength(1);
    expect(achados[0]!.servico).toContain('Premium');
  });

  it('casa termo que está no grupo/tipo, não só no serviço', () => {
    const base = [item({ servico: 'Premium Fosco 3 demãos (m²)', grupo: 'Látex' })];
    expect(filtrarPrecos(base, { q: 'latex' })).toHaveLength(1);
  });

  it('filtra por categoria', () => {
    const base = [item(), item({ category: 'Drywall', servico: 'Somente Repintura' })];
    expect(filtrarPrecos(base, { category: 'Drywall' })).toHaveLength(1);
  });

  it('filtra por altura', () => {
    const base = [
      item({ altura: 'ate_3m' }),
      item({ altura: 'acima_3m', observacao: 'acima 3 metros' }),
    ];
    expect(filtrarPrecos(base, { altura: 'acima_3m' })).toHaveLength(1);
  });

  it('mantém item SEM altura em qualquer filtro de altura', () => {
    // Diária, demarcação e serviço por peça não têm eixo de altura. Sumir
    // com eles ao filtrar "acima de 3 m" esconderia serviço que existe.
    const semEixo = item({
      altura: null,
      observacao: 'Diária',
      unidade: 'diaria',
      servico: 'Serviço básico - 8hs',
    });
    expect(filtrarPrecos([semEixo], { altura: 'acima_3m' })).toHaveLength(1);
    expect(filtrarPrecos([semEixo], { altura: 'ate_3m' })).toHaveLength(1);
  });

  it('sem filtro nenhum devolve tudo', () => {
    const base = [item(), item({ category: 'Drywall' })];
    expect(filtrarPrecos(base)).toHaveLength(2);
    expect(filtrarPrecos(base, { q: '   ' })).toHaveLength(2);
  });
});

describe('agruparPorCategoria', () => {
  it('preserva a ordem de chegada (que é a ordem impressa)', () => {
    const base = [
      item({ category: 'Diárias, Lavagens e Limpeza', sheet_no: 1 }),
      item({ category: 'Drywall', sheet_no: 19 }),
      item({ category: 'Diárias, Lavagens e Limpeza', sheet_no: 1 }),
    ];
    const grupos = agruparPorCategoria(base);
    expect(grupos.map((g) => g.category)).toEqual(['Diárias, Lavagens e Limpeza', 'Drywall']);
    expect(grupos[0]!.items).toHaveLength(2);
  });

  it('junta folhas diferentes que dividem a mesma categoria', () => {
    // Folhas 13 e 14 são o mesmo assunto em duas páginas impressas.
    const base = [
      item({ category: 'Pintura Piso e Demarcação', sheet_no: 13 }),
      item({ category: 'Pintura Piso e Demarcação', sheet_no: 14 }),
    ];
    expect(agruparPorCategoria(base)).toHaveLength(1);
    expect(listarCategorias(base)).toEqual(['Pintura Piso e Demarcação']);
  });
});

describe('rótulos', () => {
  it('traduz unidade para o que o pintor lê', () => {
    expect(unidadeCurta('m2')).toBe('m²');
    expect(unidadeCurta('metro_linear')).toBe('m linear');
    expect(unidadeLonga('diaria')).toBe('por diária de 8h');
  });

  it('unidade desconhecida passa direto em vez de sumir', () => {
    expect(unidadeCurta('galao')).toBe('galao');
  });

  it('traduz altura', () => {
    expect(rotuloAltura('ate_3m')).toBe('até 3 m');
    expect(rotuloAltura('acima_3m')).toBe('acima de 3 m');
    expect(rotuloAltura(null)).toBeNull();
  });
});

describe('semValorPublicado', () => {
  it('marca a linha zerada do documento (folha 13)', () => {
    const zerado = item({
      servico: 'Tinta Epóxi (Alta espessura) m² - Manutenção Pesada',
      preco_medio: 0,
      preco_min: 0,
      preco_max: 0,
    });
    expect(semValorPublicado(zerado)).toBe(true);
    expect(semValorPublicado(item())).toBe(false);
  });
});

describe('totalPara', () => {
  it('multiplica preço por quantidade', () => {
    expect(totalPara(20.2, 10)).toBeCloseTo(202, 5);
  });

  it('quantidade vazia, zero ou negativa vale 1 (não zera o preço na tela)', () => {
    expect(totalPara(20.2, NaN)).toBeCloseTo(20.2, 5);
    expect(totalPara(20.2, 0)).toBeCloseTo(20.2, 5);
    expect(totalPara(20.2, -3)).toBeCloseTo(20.2, 5);
  });

  it('preço ausente continua ausente', () => {
    expect(totalPara(null, 10)).toBeNull();
  });
});
