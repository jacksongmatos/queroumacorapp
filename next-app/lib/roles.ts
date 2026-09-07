// roles.ts — a lista de papéis do app, em UM lugar só.
//
// POR QUE ESTE ARQUIVO EXISTE (07/09/2026): ao acrescentar o perfil de
// Arquiteto/Engenheiro, a lista de "quem é profissional" apareceu copiada à
// mão em NOVE arquivos — perfil público, busca, chat, feed, tiles, personas,
// cadastro, onboarding do OAuth e o mapa do admin. Cada cópia tinha a sua
// versão da verdade (umas incluíam 'funileiro', outras não), e nenhuma
// aprendia sobre a outra. É a mesma doença do `isVideoPost`: regra duplicada
// é regra que diverge, e o custo aparece quando alguém adiciona o papel
// seguinte e esquece dois lugares.
//
// Papel novo = uma entrada aqui. As telas leem daqui.

export type RoleKey =
  | 'pintor'
  | 'grafiteiro'
  | 'automotivo'
  | 'arquiteto'
  | 'cliente'
  | 'admin';

export interface RoleSpec {
  key: RoleKey;
  /** Rótulo completo, como aparece no cadastro. */
  label: string;
  /** Rótulo curto pro badge embaixo do nome no feed. */
  badge?: string;
  icon: string;
  /** Descrição de uma linha no seletor de cadastro. */
  descricao: string;
  /**
   * Presta serviço: aparece na busca como profissional, tem portfólio,
   * recebe pedido de orçamento e avaliação.
   */
  profissional: boolean;
  /**
   * Contrata: pede orçamento, avalia serviço, monta lista na loja.
   * `arquiteto` é os DOIS — especifica a obra E é contratado pelo projeto.
   */
  contrata: boolean;
  /**
   * Outros valores que o banco/base antiga guardam pro mesmo papel. O
   * `funileiro` é histórico (o cadastro sempre gravou 'automotivo'); o
   * `engenheiro` é irmão do arquiteto, mesmo caso.
   */
  sinonimos?: string[];
}

export const ROLES: readonly RoleSpec[] = [
  {
    key: 'pintor',
    label: 'Pintor',
    badge: 'Pintor',
    icon: '🖌️',
    descricao: 'Pintura residencial e comercial',
    profissional: true,
    contrata: false,
  },
  {
    key: 'grafiteiro',
    label: 'Grafiteiro / Muralista',
    badge: 'Grafiteiro',
    icon: '🎨',
    descricao: 'Arte urbana, murais, painéis e arte pra venda',
    profissional: true,
    contrata: false,
    sinonimos: ['graffiti'],
  },
  {
    key: 'automotivo',
    label: 'Funileiro / Estética Automotiva',
    badge: 'Funileiro / Automotivo',
    icon: '🚗',
    descricao: 'Funilaria, pintura, envelopamento, polimento',
    profissional: true,
    contrata: false,
    sinonimos: ['funileiro'],
  },
  {
    key: 'arquiteto',
    label: 'Arquiteto / Engenheiro',
    badge: 'Arquiteto / Engenheiro',
    icon: '📐',
    descricao: 'Projeto, especificação de cores e acompanhamento de obra',
    profissional: true,
    contrata: true,
    sinonimos: ['engenheiro'],
  },
  {
    key: 'cliente',
    label: 'Cliente',
    badge: undefined,
    icon: '🏠',
    descricao: 'Encontrar profissionais e pedir orçamentos',
    profissional: false,
    contrata: true,
  },
];

const PORCHAVE = new Map<string, RoleSpec>();
for (const spec of ROLES) {
  PORCHAVE.set(spec.key, spec);
  for (const s of spec.sinonimos ?? []) PORCHAVE.set(s, spec);
}

/**
 * Reduz sinônimo ao papel canônico ('funileiro' → 'automotivo',
 * 'engenheiro' → 'arquiteto'). Devolve '' pro que não conhecemos —
 * inclusive 'admin', que não é papel de ofício.
 */
export function normalizeRole(role: string | null | undefined): RoleKey | '' {
  return PORCHAVE.get((role || '').trim().toLowerCase())?.key ?? '';
}

/** Presta serviço (busca, portfólio, orçamento, avaliação). */
export function isProfessionalRole(role: string | null | undefined): boolean {
  return PORCHAVE.get((role || '').trim().toLowerCase())?.profissional === true;
}

/** Contrata (pede orçamento, avalia obra). */
export function contrata(role: string | null | undefined): boolean {
  return PORCHAVE.get((role || '').trim().toLowerCase())?.contrata === true;
}

/** Rótulo curto pro badge do feed. Vazio quando o papel não mostra badge. */
export function roleBadge(role: string | null | undefined): string {
  return PORCHAVE.get((role || '').trim().toLowerCase())?.badge ?? '';
}

/** Rótulo completo (cadastro, portal, telas de perfil). */
export function roleLabel(role: string | null | undefined): string {
  return PORCHAVE.get((role || '').trim().toLowerCase())?.label ?? '';
}

/** Opções do seletor de cadastro, na ordem em que aparecem. */
export const ROLE_OPTIONS = ROLES.map(({ key, label, icon, descricao }) => ({
  value: key,
  label,
  icon,
  descricao,
}));
