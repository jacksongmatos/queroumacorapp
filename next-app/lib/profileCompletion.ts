// profileCompletion — "esse perfil dá pra usar o app?" numa função só.
//
// Conta criada por Google/Apple nasce SEM categoria e SEM @tag: o provedor
// devolve e-mail, nome e foto, e mais nada. Quem passa pelo /completar-perfil
// preenche; quem não passa (redirect que não pousou lá, aba fechada no meio)
// fica com um perfil pela metade — sem @tag ninguém acha a pessoa na busca,
// e o link do perfil não existe.
//
// A regra vive aqui, e não dentro do formulário, porque dois lugares
// precisam dela: o /completar-perfil (pra decidir entre pedir os dados e
// mandar pro /feed) e o AppShell (pra levar de volta quem escapou).

export interface CompletableProfile {
  user_type?: unknown;
  role?: unknown;
  tag?: unknown;
  username?: unknown;
}

/** String não-vazia depois de tirar espaço — `''` e `'  '` não contam. */
function filled(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : !!value;
}

/**
 * Mínimo pra usar o app: uma categoria (o trigger do banco espelha
 * `user_type` em `role`, então qualquer um dos dois serve) e uma @tag
 * (`tag` e `username` são sinônimos sincronizados por trigger).
 */
export function isProfileComplete(profile: CompletableProfile | null | undefined): boolean {
  if (!profile) return false;
  const hasCategory = filled(profile.user_type) || filled(profile.role);
  const hasTag = filled(profile.tag) || filled(profile.username);
  return hasCategory && hasTag;
}
