// Cadastro (2026-09-05): três ajustes pedidos pelo usuário.
//
//  1. Data de nascimento DIGITÁVEL. Era `<input type="date">`: no celular o
//     seletor abre no ano atual e escolher o ano de nascimento exige rolar
//     décadas — quem nasceu em 1975 rola meio século pra se cadastrar.
//  2. @tag só com LETRAS (era `[a-z0-9_]`), com a regra visível na tela e uma
//     sugestão a partir do nome.
//  3. Nome só com LETRAS.
//
// O que se testa aqui são as funções puras — a máscara, a conversão e os
// filtros — porque é nelas que mora a decisão. O acento é o ponto sensível
// dos dois filtros e tem caso próprio: nome brasileiro TEM acento, tag não
// pode ter.

import { describe, it, expect } from 'vitest';
import {
  mascararDataBR,
  dataBRParaISO,
  isoParaDataBR,
  limparNome,
  formatarNomeProprio,
  limparTag,
  sugerirTagDeNome,
  personNameSchema,
  tagSchema,
} from '@/lib/schemas';

describe('data de nascimento: digitar em vez de rolar', () => {
  it('as barras entram sozinhas conforme se digita', () => {
    expect(mascararDataBR('1')).toBe('1');
    expect(mascararDataBR('12')).toBe('12');
    expect(mascararDataBR('123')).toBe('12/3');
    expect(mascararDataBR('1234')).toBe('12/34');
    expect(mascararDataBR('12345')).toBe('12/34/5');
    expect(mascararDataBR('12031975')).toBe('12/03/1975');
  });

  it('ignora o que não é dígito e não passa de 8 números', () => {
    // A pessoa colando "12-03-1975" ou digitando a barra na mão não pode
    // produzir "12//03".
    expect(mascararDataBR('12-03-1975')).toBe('12/03/1975');
    expect(mascararDataBR('12/03/1975')).toBe('12/03/1975');
    expect(mascararDataBR('120319759999')).toBe('12/03/1975');
    expect(mascararDataBR('abc')).toBe('');
  });

  it('converte pra ISO só quando a data está completa', () => {
    expect(dataBRParaISO('12/03/1975')).toBe('1975-03-12');
    expect(dataBRParaISO('12/03/197')).toBe('');
    expect(dataBRParaISO('')).toBe('');
  });

  it('recusa data que não existe — 31/02 não pode virar 03/03', () => {
    // O `Date` do JS transborda em silêncio: new Date('1975-02-31') vira
    // 3 de março. Sem a checagem de volta, o cadastro gravaria outra data.
    expect(dataBRParaISO('31/02/1975')).toBe('');
    expect(dataBRParaISO('31/04/1990')).toBe('');
    expect(dataBRParaISO('32/01/1990')).toBe('');
    expect(dataBRParaISO('12/13/1990')).toBe('');
  });

  it('aceita 29/02 em ano bissexto e recusa fora dele', () => {
    expect(dataBRParaISO('29/02/2000')).toBe('2000-02-29');
    expect(dataBRParaISO('29/02/1999')).toBe('');
  });

  it('volta pra DD/MM/AAAA — repopular o campo ao voltar um passo', () => {
    expect(isoParaDataBR('1975-03-12')).toBe('12/03/1975');
    expect(isoParaDataBR('')).toBe('');
    expect(isoParaDataBR('12/03/1975')).toBe('');
  });
});

describe('@tag: só letras', () => {
  it('o schema recusa número, símbolo e espaço', () => {
    expect(tagSchema.safeParse('joaovictor').success).toBe(true);
    expect(tagSchema.safeParse('joao123').success).toBe(false);
    expect(tagSchema.safeParse('joao_victor').success).toBe(false);
    expect(tagSchema.safeParse('joao victor').success).toBe(false);
    expect(tagSchema.safeParse('joão').success).toBe(false);
    expect(tagSchema.safeParse('jo').success).toBe(false);
  });

  it('MAIÚSCULA vira minúscula, que é o formato do banco', () => {
    const r = tagSchema.safeParse('JoaoVictor');
    expect(r.success && r.data).toBe('joaovictor');
  });

  it('o filtro de digitação tira acento em vez de recusar', () => {
    // Recusar "João" faria a pessoa adivinhar o que fazer; virar "joao" é o
    // que ela queria. Acento some, não vira erro.
    expect(limparTag('João Victor')).toBe('joaovictor');
    expect(limparTag('Conceição')).toBe('conceicao');
    expect(limparTag('ana_123!')).toBe('ana');
  });

  it('respeita o teto de 24 letras', () => {
    expect(limparTag('a'.repeat(40))).toHaveLength(24);
  });
});

describe('sugestão de @ a partir do nome', () => {
  it('monta a sugestão sem acento, espaço nem maiúscula', () => {
    expect(sugerirTagDeNome('José da Silva Ávila')).toBe('josedasilvaavila');
    expect(sugerirTagDeNome('Ana Beatriz')).toBe('anabeatriz');
  });

  it('a sugestão é sempre válida pelo próprio schema', () => {
    // Oferecer um @ que a validação recusa em seguida é pior que não sugerir.
    const s = sugerirTagDeNome('José da Silva');
    expect(tagSchema.safeParse(s).success).toBe(true);
  });

  it('nome curto demais não gera sugestão', () => {
    expect(sugerirTagDeNome('Jo')).toBe('');
    expect(sugerirTagDeNome('')).toBe('');
    expect(sugerirTagDeNome('12 34')).toBe('');
  });
});

describe('nome: só letras, mas ACENTO É LETRA', () => {
  it('aceita nome brasileiro de verdade', () => {
    // Um filtro ASCII recusaria metade do país. O regex é \p{L} por isso.
    for (const nome of ['Maria José', 'Conceição', "D'Ávila", 'Jean-Pierre', 'Ana']) {
      expect(personNameSchema.safeParse(nome).success, nome).toBe(true);
    }
  });

  it('recusa número e símbolo', () => {
    expect(personNameSchema.safeParse('Joao 123').success).toBe(false);
    expect(personNameSchema.safeParse('Joao@casa').success).toBe(false);
    expect(personNameSchema.safeParse('Joao #1').success).toBe(false);
  });

  it('continua recusando email como nome', () => {
    expect(personNameSchema.safeParse('joao@email.com').success).toBe(false);
  });

  it('o filtro de digitação tira só o que não pode', () => {
    expect(limparNome('João 123')).toBe('João ');
    expect(limparNome('Ana@#$')).toBe('Ana');
    // 07/09/2026 — hífen e apóstrofo saíram junto com o resto: a regra
    // pedida foi "só letra e acento". O custo é conhecido e está aqui pra
    // ninguém descobrir por acidente: nome composto perde o sinal.
    expect(limparNome('Maria-José')).toBe('MariaJosé');
    expect(limparNome("D'Ávila")).toBe('DÁvila');
  });

  it('formata em Maiúscula Inicial, com conectivo minúsculo', () => {
    expect(formatarNomeProprio('joão da silva')).toBe('João da Silva');
    expect(formatarNomeProprio('MARIA DOS SANTOS')).toBe('Maria dos Santos');
    expect(formatarNomeProprio('ana')).toBe('Ana');
    // Conectivo no COMEÇO mantém a maiúscula — "da Costa" sozinho pareceria
    // erro do app.
    expect(formatarNomeProprio('da costa')).toBe('Da Costa');
  });
});
