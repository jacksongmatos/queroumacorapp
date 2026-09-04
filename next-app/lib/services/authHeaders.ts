// authHeaders — header de autenticação para as rotas protegidas por
// `gateProAI`/`gateProAIForm`.
//
// POR QUE ISTO EXISTE (2026-09-04): o servidor tira o token de DOIS lugares
// só — o header `Authorization: Bearer` ou um campo `accessToken` no corpo
// (ver `getToken`/`getTokenFromForm` em lib/api/security.ts). NÃO há fallback
// de cookie. Enquanto o gate era fail-open, chamada sem token passava; o fix
// C1 da auditoria fechou isso (anônimo virou 401) — corretamente —, mas os
// serviços de IA nunca passaram a mandar o token. Resultado: TODA rota de IA
// respondia 401 `Faça login` mesmo com o usuário logado (a tela mostrava a
// mensagem do servidor, e o chat caía no fallback offline "Conexão com o Seu
// Zé falhou").
//
// O header serve às duas famílias de rota — JSON e multipart —, então é uma
// solução única em vez de dois caminhos.
//
// Best-effort de propósito: sem sessão (ou com falha ao lê-la) devolve `{}` e
// a rota responde 401 como responderia hoje — nunca fica pior, e nunca lança
// no meio de um clique do usuário.

import { getSupabase } from '../supabase';

// Teto de tempo: no WebView uma promessa de rede pendurada não rejeita (lição
// registrada no CLAUDE.md sobre `getSession` no boot). Sem isto, um botão de
// IA poderia ficar girando pra sempre em vez de falhar legível.
const SESSION_TIMEOUT_MS = 5_000;

export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const sb = getSupabase();
    const token = await Promise.race([
      sb.auth.getSession().then((r) => r?.data?.session?.access_token ?? ''),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), SESSION_TIMEOUT_MS)),
    ]);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
