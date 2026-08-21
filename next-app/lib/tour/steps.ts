// steps.ts — roteiro do tour guiado (coach marks) que roda na PRIMEIRA vez
// que o usuário abre o app. Cada passo aponta pra um elemento real da UI
// via `data-tour="..."` (atributo colocado no TopNav/BottomNav) e mostra um
// balão com uma explicação curta, em linguagem bem simples.
//
// Passos com `selector: null` não destacam nada — viram um cartão
// centralizado (usado na abertura e no encerramento).
//
// Ordem pedida: Início → Mensagens → Buscar → Loja → Avisos → Perfil → Plano.

export interface TourStep {
  /** Identificador estável (usado em key/testes). */
  id: string;
  /** Seletor CSS do alvo. `null` = cartão centralizado, sem recorte. */
  selector: string | null;
  /** Emoji grande do balão (evita depender de lib de ícones). */
  emoji: string;
  title: string;
  /** 1-2 frases curtas, tom "explica pra criança". */
  text: string;
  /** Raio do recorte do holofote, em px. */
  radius?: number;
}

export const TOUR_STEPS: ReadonlyArray<TourStep> = [
  {
    id: 'welcome',
    selector: null,
    emoji: '👋',
    title: 'Oi! Bem-vindo ao QueroUmaCor',
    text: 'Vou te mostrar pra que serve cada botão do app. É rapidinho, menos de um minuto.',
  },
  {
    id: 'feed',
    selector: '[data-tour="nav-feed"]',
    emoji: '🏠',
    title: 'A casinha é o Início',
    text: 'Toque aqui pra voltar pra página inicial, onde aparecem todos os posts dos pintores.',
  },
  {
    id: 'chat',
    selector: '[data-tour="nav-chat"]',
    emoji: '💬',
    title: 'Aqui ficam as mensagens',
    text: 'É o seu chat com clientes e outros profissionais. Quando chega mensagem nova, aparece uma bolinha vermelha.',
  },
  {
    id: 'search',
    selector: '[data-tour="nav-search"]',
    emoji: '🔎',
    title: 'A lupa procura tudo',
    text: 'Digite um nome, um serviço ou uma tinta e a lupa acha pintores, posts e produtos.',
  },
  {
    id: 'loja',
    selector: '[data-tour="nav-loja"]',
    emoji: '🛒',
    title: 'A sacolinha é a Loja',
    text: 'Escolha tintas e materiais, monte sua lista de pedido e a equipe da Cali Colors te chama no WhatsApp.',
  },
  {
    id: 'notificacoes',
    selector: '[data-tour="nav-notif"]',
    emoji: '🔔',
    title: 'O sininho avisa você',
    text: 'Ele mostra quem curtiu, quem comentou e quem começou a te seguir.',
  },
  {
    id: 'perfil',
    selector: '[data-tour="nav-perfil"]',
    emoji: '👤',
    title: 'O bonequinho é o seu perfil',
    text: 'Seu espaço: suas fotos de trabalho, suas avaliações e as ferramentas de orçamento, agenda e clientes.',
  },
  {
    id: 'plano',
    selector: '[data-tour="nav-plano"]',
    emoji: '⭐',
    title: 'Esse é o seu plano',
    text: 'Mostra se você está no GRÁTIS ou no PRO. Toque pra ver o que o plano PRO libera.',
  },
  {
    id: 'done',
    selector: null,
    emoji: '🎉',
    title: 'Pronto, é só isso!',
    text: 'Agora pode explorar à vontade. Se quiser rever depois, o botão “Ver tutorial de novo” fica lá no seu perfil.',
  },
];

/**
 * Filtra os passos cujo alvo realmente existe na tela agora. Telas que
 * escondem a TopNav/BottomNav (ex.: conversa de chat) simplesmente pulam
 * os passos correspondentes em vez de destacar o vazio.
 */
export function resolveVisibleSteps(
  steps: ReadonlyArray<TourStep>,
  exists: (selector: string) => boolean,
): TourStep[] {
  return steps.filter((s) => s.selector === null || exists(s.selector));
}
