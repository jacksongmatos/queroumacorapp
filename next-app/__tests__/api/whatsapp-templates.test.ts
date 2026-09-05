// Normalização dos templates vindos da Meta/Dualhook.
//
// Por que existe: a lista de templates estava ESCRITA A MÃO no portal.
// Lista à mão envelhece igual lista de pendência — alguém aprova um
// template novo no painel, ninguém mexe no código, e a tela segue
// oferecendo dois. Pior: se o nome mudar lá, o envio quebra com 132001 e a
// tela continua exibindo o nome velho como se estivesse certo.

import { describe, it, expect } from 'vitest';
import {
  extrairVariaveis,
  normalizarTemplate,
} from '../../app/api/whatsapp/templates/route';

describe('extrairVariaveis', () => {
  // Contamos pelo TEXTO, não pelo `example`: template pode ter variável sem
  // exemplo cadastrado, e o campo tem que aparecer na tela mesmo assim.
  it('acha as variáveis pelo corpo, mesmo sem exemplo', () => {
    const v = extrairVariaveis('Oi {{1}}, seu orçamento {{2}} está pronto.', []);
    expect(v).toEqual([
      { indice: 1, exemplo: null },
      { indice: 2, exemplo: null },
    ]);
  });

  it('casa cada exemplo com a variável certa', () => {
    const v = extrairVariaveis('Oi {{1}}, orçamento {{2}}.', ['Bianca', '1042']);
    expect(v[0].exemplo).toBe('Bianca');
    expect(v[1].exemplo).toBe('1042');
  });

  it('não duplica variável repetida no texto', () => {
    const v = extrairVariaveis('Oi {{1}}! Até logo, {{1}}.', ['Ana']);
    expect(v).toHaveLength(1);
  });

  it('ordena por índice mesmo fora de ordem no texto', () => {
    const v = extrairVariaveis('{{2}} para {{1}}', []);
    expect(v.map((x) => x.indice)).toEqual([1, 2]);
  });

  it('tolera espaço dentro das chaves', () => {
    expect(extrairVariaveis('Oi {{ 1 }}', [])).toHaveLength(1);
  });

  it('template sem variável não gera campo', () => {
    expect(extrairVariaveis('Texto fixo, sem variável.', [])).toEqual([]);
    expect(extrairVariaveis(null, [])).toEqual([]);
  });

  // Exemplo sem `{{n}}` no texto é lixo de cadastro; seguir o exemplo
  // criaria um campo que a Meta não espera e o envio falharia.
  it('exemplo sobrando não inventa variável', () => {
    expect(extrairVariaveis('Sem variável.', ['sobra'])).toEqual([]);
  });
});

describe('normalizarTemplate', () => {
  it('lê corpo, cabeçalho, rodapé e exemplos', () => {
    const t = normalizarTemplate({
      name: 'calicolors_orcamento_pronto',
      language: 'pt_BR',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        { type: 'HEADER', text: 'Orçamento pronto' },
        {
          type: 'BODY',
          text: 'Oi {{1}}, o orçamento {{2}} está pronto.',
          example: { body_text: [['Bianca', '1042']] },
        },
        { type: 'FOOTER', text: 'Cali Colors' },
      ],
    });
    expect(t?.nome).toBe('calicolors_orcamento_pronto');
    expect(t?.categoria).toBe('UTILITY');
    expect(t?.cabecalho).toBe('Orçamento pronto');
    expect(t?.rodape).toBe('Cali Colors');
    expect(t?.variaveis).toHaveLength(2);
    expect(t?.variaveis[1].exemplo).toBe('1042');
  });

  it('template sem nome é descartado', () => {
    expect(normalizarTemplate({ language: 'pt_BR' })).toBeNull();
    expect(normalizarTemplate(null)).toBeNull();
    expect(normalizarTemplate('x')).toBeNull();
  });

  it('sem components não quebra', () => {
    const t = normalizarTemplate({ name: 'x', status: 'APPROVED' });
    expect(t?.corpo).toBeNull();
    expect(t?.variaveis).toEqual([]);
  });
});
