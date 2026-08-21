// Regra "perfil dá pra usar o app?" — usada pelo /completar-perfil e pelo
// guard do AppShell. Conta de Google/Apple nasce sem categoria e sem @tag.

import { describe, it, expect } from 'vitest';
import { isProfileComplete } from '@/lib/profileCompletion';

describe('isProfileComplete', () => {
  it('perfil com categoria e tag está completo', () => {
    expect(isProfileComplete({ user_type: 'pintor', tag: 'joao' })).toBe(true);
    expect(isProfileComplete({ role: 'cliente', username: 'maria' })).toBe(true);
  });

  it('conta recém-criada por OAuth (sem nada) está incompleta', () => {
    expect(isProfileComplete({})).toBe(false);
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete(undefined)).toBe(false);
  });

  it('falta só a tag → incompleto (é o caso que aparece no admin)', () => {
    expect(isProfileComplete({ user_type: 'pintor' })).toBe(false);
    expect(isProfileComplete({ user_type: 'pintor', tag: null })).toBe(false);
  });

  it('falta só a categoria → incompleto', () => {
    expect(isProfileComplete({ tag: 'joao' })).toBe(false);
  });

  it('string vazia ou só espaço não conta como preenchido', () => {
    expect(isProfileComplete({ user_type: 'pintor', tag: '' })).toBe(false);
    expect(isProfileComplete({ user_type: 'pintor', tag: '   ' })).toBe(false);
    expect(isProfileComplete({ user_type: '', role: '', tag: 'joao' })).toBe(false);
  });

  it('tag e username são sinônimos; user_type e role também', () => {
    expect(isProfileComplete({ role: 'pintor', tag: 'x' })).toBe(true);
    expect(isProfileComplete({ user_type: 'pintor', username: 'x' })).toBe(true);
  });
});
