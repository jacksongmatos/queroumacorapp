// aiPersona.ts — qual "parceiro digital" atende cada papel.
//
// A regra já existia espalhada no BusinessGrid (quais tiles de persona
// aparecem por role). Aqui ela vira dado reusável pra qualquer tela que
// precise falar do parceiro SEM cravar um nome — na /pro, por exemplo, o
// texto é "seu parceiro digital" e a foto/nome variam conforme o perfil:
//   pintor (ou sem role) → Seu Zé · grafiteiro → Fê
//   automotivo/funileiro → Senna · cliente → Alice
//
// Módulo puro (sem imports) pra teste unitário direto.

export interface AiPersona {
  id: 'seu-ze' | 'fe' | 'senna' | 'alice';
  /** Nome próprio — usado só onde faz sentido nomear. */
  name: string;
  /** Foto em /public/img — mesmo tamanho dos ícones da lista. */
  image: string;
  /** Rota do chat da persona. */
  href: string;
}

export const PERSONAS: Record<AiPersona['id'], AiPersona> = {
  'seu-ze': { id: 'seu-ze', name: 'Seu Zé', image: '/img/seu-ze.webp', href: '/seu-ze' },
  fe: { id: 'fe', name: 'Fê', image: '/img/fe.webp', href: '/fe' },
  senna: { id: 'senna', name: 'Senna', image: '/img/senna.webp', href: '/senna' },
  alice: { id: 'alice', name: 'Alice Codessi', image: '/img/alice.webp', href: '/alice' },
};

/**
 * Persona do papel informado. Espelha o filtro de tiles do BusinessGrid:
 * role vazio cai no Seu Zé (fallback genérico), igual lá.
 */
export function personaForRole(role?: string | null): AiPersona {
  switch ((role || '').toLowerCase()) {
    case 'grafiteiro':
      return PERSONAS.fe;
    case 'automotivo':
    case 'funileiro':
      return PERSONAS.senna;
    case 'cliente':
      return PERSONAS.alice;
    case 'pintor':
    default:
      return PERSONAS['seu-ze'];
  }
}
