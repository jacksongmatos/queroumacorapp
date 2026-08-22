'use client';
// Provider que centraliza a sessão Supabase no React Context. Substitui o
// par `currentUser` + `initAuth()` do `head.js` vanilla — onde aquela versão
// pendurava o user numa global e chamava `loadFeed()`/`refreshProStatus()`
// imperativamente, aqui o estado vive em useState e os consumers (Header,
// Nav, páginas privadas) leem via `useAuth()` e reagem com useEffect.
//
// Eventos cobertos:
// - getSession() inicial (restaurar sessão de localStorage)
// - onAuthStateChange (login, logout, refresh do token, recovery)
// - signIn / signOut helpers (encapsulam supabase-js pra UI não importar SDK)
//
// Não trata PASSWORD_RECOVERY aqui — isso fica em `/update-password/page.tsx`
// quando essa rota for portada.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True quando o user tem email confirmado (Supabase
   *  `auth.users.email_confirmed_at` presente). False quando logado mas
   *  sem confirmar; null quando deslogado. Usado por componentes pra
   *  gating de mutações (publicar post, comentar, mandar DM) e pra
   *  banner de "Confirme seu email". */
  emailVerified: boolean | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  /** Login/cadastro com Google (Supabase OAuth). Redireciona o browser pro
   *  Google e volta pra `/completar-perfil` (que manda pro /feed se o perfil
   *  já estiver completo, ou pede categoria/@tag se for conta nova). Retorna
   *  `{ error }` só se a inicialização do fluxo falhar (antes do redirect). */
  signInWithGoogle: () => Promise<{ error?: string }>;
  /** Login/cadastro com Apple (Supabase OAuth). Mesmo fluxo do Google. */
  signInWithApple: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Reenvio do email de confirmação (Supabase resend). Retorna mensagem
   *  amigável de erro ou undefined em sucesso. */
  resendVerification: () => Promise<{ error?: string }>;
}

// Teto pra resolução da sessão inicial. 8s é generoso pra um refresh de token
// em 3G ruim e curto o bastante pra ninguém achar que o app travou.
const SESSION_TIMEOUT_MS = 8000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabase();
    let mounted = true;

    // `getSession()` NÃO é só leitura de localStorage: quando o access token
    // está vencido, o supabase-js dispara um refresh pela rede e só resolve
    // depois dele. Dentro do WebView (Capacitor iOS/Android) esse fetch pode
    // ficar pendurado pra sempre — o sistema congela o WebView no background
    // e a requisição que estava em voo nunca é rejeitada nem concluída ao
    // voltar. Como o `loading` só virava false no `.then`/`.catch`, o app
    // ficava eternamente no "Carregando…" do AppShell: exatamente o
    // "sai e volta e não abre mais" relatado.
    //
    // Aqui a promessa corre contra um timeout. Estourou, destrava a tela: o
    // usuário cai no /login (que já manda de volta pro /feed sozinho se a
    // sessão aparecer depois pelo onAuthStateChange) em vez de encarar uma
    // tela morta sem saída.
    const syncSession = async () => {
      try {
        const result = await Promise.race([
          sb.auth.getSession(),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), SESSION_TIMEOUT_MS),
          ),
        ]);
        if (!mounted) return;
        if (result) {
          setSession(result.data.session);
          setUser(result.data.session?.user ?? null);
        }
      } catch {
        // Falha de rede/refresh — segue pro finally e destrava a tela.
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void syncSession();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      // Só destrava quando REALMENTE chegou uma sessão. Com `sess` nulo o
      // `getSession()` (e o timeout dele) é quem decide — senão um
      // INITIAL_SESSION vazio adiantaria um pulo pro /login antes da sessão
      // guardada terminar de ser restaurada.
      if (sess) setLoading(false);
    });

    // Ao voltar do background (ou ao recuperar a rede), refaz a leitura da
    // sessão. Sem isso, quem destravou pelo timeout ficaria "deslogado" até
    // matar o app: o supabase-js não tenta de novo sozinho, e o WebView não
    // recarrega a página ao ser retomado.
    const onResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void syncSession();
    };
    // `pageshow` só interessa com persisted=true (volta do bfcache no
    // Safari/WKWebView); no load normal ele duplicaria o sync do mount.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void syncSession();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onResume);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onResume);
      window.addEventListener('pageshow', onPageShow);
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onResume);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onResume);
        window.removeEventListener('pageshow', onPageShow);
      }
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  // Helper genérico de OAuth — Google e Apple só diferem no `provider`.
  const signInWithOAuth = useCallback(
    async (provider: 'google' | 'apple'): Promise<{ error?: string }> => {
      const nome = provider === 'apple' ? 'Apple' : 'Google';
      try {
        const sb = getSupabase();
        // redirectTo baseado no origin atual → funciona em produção e nos
        // previews (*.pages.dev). Precisa estar na allowlist de Redirect URLs
        // do Supabase (Auth → URL Configuration). Volta pra /completar-perfil,
        // que decide entre /feed (perfil completo) e onboarding (conta nova).
        const redirectTo =
          typeof window !== 'undefined'
            ? `${window.location.origin}/completar-perfil`
            : undefined;
        const { error } = await sb.auth.signInWithOAuth({
          provider,
          options: redirectTo ? { redirectTo } : undefined,
        });
        // Em sucesso o supabase-js navega o browser pro provedor (não retorna aqui).
        return error ? { error: error.message } : {};
      } catch (e) {
        return {
          error: e instanceof Error ? e.message : `Falha ao conectar com o ${nome}`,
        };
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(
    () => signInWithOAuth('google'),
    [signInWithOAuth],
  );
  const signInWithApple = useCallback(
    () => signInWithOAuth('apple'),
    [signInWithOAuth],
  );

  const signOut = useCallback(async () => {
    // CRIT-4: limpa o cookie httpOnly `sb-session-token` (gravado no login
    // por /api/auth/set-session-cookie) pra que o guard server-side de
    // /admin/* não conceda acesso após logout. Não-fatal.
    try {
      await fetch('/api/auth/set-session-cookie', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      // Silencioso.
    }
    await getSupabase().auth.signOut();
  }, []);

  const resendVerification = useCallback(async (): Promise<{ error?: string }> => {
    if (!user?.email) return { error: 'Faça login antes de reenviar.' };
    try {
      const sb = getSupabase();
      // Supabase v2: auth.resend({ type: 'signup', email })
      const sbAny = sb.auth as unknown as {
        resend: (opts: { type: 'signup'; email: string }) => Promise<{ error?: { message: string } | null }>;
      };
      const { error } = await sbAny.resend({ type: 'signup', email: user.email });
      if (error) return { error: error.message };
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Falha ao reenviar' };
    }
  }, [user]);

  // emailVerified: true quando Supabase marcou email_confirmed_at; false
  // quando logado e ainda não confirmou; null quando deslogado.
  const emailVerified: boolean | null = user
    ? Boolean((user as User & { email_confirmed_at?: string | null }).email_confirmed_at)
    : null;

  // useMemo evita re-render dos consumers quando o pai re-renderiza sem
  // mudança real no value — só refaz quando algum field muda de identidade.
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      emailVerified,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signOut,
      resendVerification,
    }),
    [
      user,
      session,
      loading,
      emailVerified,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signOut,
      resendVerification,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
