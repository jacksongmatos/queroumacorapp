// aiPersona (2026-08-28) — qual parceiro digital atende cada papel.
// A regra espelha o filtro de tiles do BusinessGrid; se as duas
// divergirem, a /pro mostra uma foto de persona que o usuário nem tem.

import { describe, it, expect } from 'vitest';
import { PERSONAS, personaForRole } from '@/lib/aiPersona';

describe('personaForRole', () => {
  it('pintor → Seu Zé', () => {
    expect(personaForRole('pintor').id).toBe('seu-ze');
  });

  it('grafiteiro → Fê', () => {
    expect(personaForRole('grafiteiro').id).toBe('fe');
  });

  it('automotivo e funileiro → Senna', () => {
    expect(personaForRole('automotivo').id).toBe('senna');
    expect(personaForRole('funileiro').id).toBe('senna');
  });

  it('cliente → Alice', () => {
    expect(personaForRole('cliente').id).toBe('alice');
  });

  it('role vazio/desconhecido cai no Seu Zé (mesmo fallback do BusinessGrid)', () => {
    expect(personaForRole('').id).toBe('seu-ze');
    expect(personaForRole(null).id).toBe('seu-ze');
    expect(personaForRole(undefined).id).toBe('seu-ze');
    expect(personaForRole('role-novo').id).toBe('seu-ze');
  });

  it('não depende de caixa alta', () => {
    expect(personaForRole('GRAFITEIRO').id).toBe('fe');
  });

  it('toda persona tem imagem em /img e rota própria', () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p.image.startsWith('/img/')).toBe(true);
      expect(p.href.startsWith('/')).toBe(true);
      expect(p.name.length).toBeGreaterThan(1);
    }
  });
});
