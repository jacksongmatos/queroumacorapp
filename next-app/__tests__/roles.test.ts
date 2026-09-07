// roles.test.ts — trava a fonte única de papéis (lib/roles.ts).
//
// Contexto (07/09/2026): a lista de "quem é profissional" estava copiada em
// nove arquivos e as cópias já divergiam — umas incluíam 'funileiro', outras
// não; o rótulo do automotivo era um no cadastro e outro no onboarding do
// OAuth. Papel novo passa a ser uma entrada só, e estes testes garantem que
// os sinônimos históricos continuam valendo.

import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ROLE_OPTIONS,
  normalizeRole,
  isProfessionalRole,
  contrata,
  roleBadge,
  roleLabel,
} from '@/lib/roles';
import { personaForRole } from '@/lib/aiPersona';
import { getEspecialidadesByRole } from '@/lib/services/profile';

describe('lib/roles', () => {
  it('normaliza os sinônimos históricos', () => {
    expect(normalizeRole('funileiro')).toBe('automotivo');
    expect(normalizeRole('engenheiro')).toBe('arquiteto');
    expect(normalizeRole('graffiti')).toBe('grafiteiro');
    expect(normalizeRole('  Pintor ')).toBe('pintor');
  });

  it('papel desconhecido e vazio não viram nada', () => {
    expect(normalizeRole('')).toBe('');
    expect(normalizeRole(null)).toBe('');
    expect(normalizeRole('astronauta')).toBe('');
    // 'admin' não é papel de ofício — quem trata admin é o isAdmin.
    expect(normalizeRole('admin')).toBe('');
  });

  it('arquiteto/engenheiro é profissional E contrata', () => {
    for (const r of ['arquiteto', 'engenheiro']) {
      expect(isProfessionalRole(r)).toBe(true);
      expect(contrata(r)).toBe(true);
    }
  });

  it('pintor presta serviço mas não é tratado como quem contrata', () => {
    expect(isProfessionalRole('pintor')).toBe(true);
    expect(contrata('pintor')).toBe(false);
    expect(isProfessionalRole('cliente')).toBe(false);
    expect(contrata('cliente')).toBe(true);
  });

  it('funileiro continua sendo profissional (a regressão clássica)', () => {
    // Duas das cópias antigas esqueciam o 'funileiro' e a pessoa perdia o
    // CTA de orçamento no próprio perfil público.
    expect(isProfessionalRole('funileiro')).toBe(true);
  });

  it('rótulos', () => {
    expect(roleLabel('arquiteto')).toBe('Arquiteto / Engenheiro');
    expect(roleBadge('engenheiro')).toBe('Arquiteto / Engenheiro');
    expect(roleBadge('funileiro')).toBe('Funileiro / Automotivo');
    // Cliente não mostra badge de ofício embaixo do nome.
    expect(roleBadge('cliente')).toBe('');
    expect(roleLabel('astronauta')).toBe('');
  });

  it('o seletor de cadastro oferece todos os papéis, cliente por último', () => {
    expect(ROLE_OPTIONS.map((o) => o.value)).toEqual([
      'pintor',
      'grafiteiro',
      'automotivo',
      'arquiteto',
      'cliente',
    ]);
    // Nenhum papel entra sem rótulo/ícone/descrição — o seletor renderiza os três.
    for (const r of ROLES) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.icon.length).toBeGreaterThan(0);
      expect(r.descricao.length).toBeGreaterThan(0);
    }
  });
});

describe('arquiteto nas regras que dependem de papel', () => {
  it('a persona é o Seu Zé', () => {
    expect(personaForRole('arquiteto').id).toBe('seu-ze');
    expect(personaForRole('engenheiro').id).toBe('seu-ze');
  });

  it('tem catálogo de especialidades próprio', () => {
    const specs = getEspecialidadesByRole('arquiteto');
    expect(specs).toContain('Consultoria de Cores');
    expect(specs.length).toBeGreaterThan(5);
    // O sinônimo puxa o MESMO catálogo — senão o engenheiro cai no seletor
    // vazio e o campo some da tela sem explicação.
    expect(getEspecialidadesByRole('engenheiro')).toEqual(specs);
  });
});
