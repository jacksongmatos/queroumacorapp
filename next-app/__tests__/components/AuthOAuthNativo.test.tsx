// @vitest-environment jsdom
//
// REGRA (06/09/2026, rejeição da App Review na build 17, Guideline 2.1):
// dentro da casca nativa, o login social NUNCA pode cair no fluxo web do
// supabase-js. Aquele fluxo navega a PRÓPRIA WebView pro provedor; como
// `appleid.apple.com` não está em `server.allowNavigation`, o Capacitor
// entrega a URL ao sistema e CANCELA a navegação — e o cancelamento vira
// `didFailProvisionalNavigation`, onde o Capacitor carrega a `errorPath`.
// Resultado: a tela "Sem conexão" em tela cheia, com a internet funcionando.
// Foi o print que a Apple anexou.
//
// Este teste falha se alguém reintroduzir o fallback.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

const signInWithOAuthSb = vi.fn();
const signIn = vi.fn();
const isAvailable = vi.fn();
const isNative = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOAuth: signInWithOAuthSb,
    },
  }),
}));

vi.mock('@/lib/native', () => ({
  native: {
    isNative: () => isNative(),
    platform: () => 'ios',
    plugins: () => ['App', 'Console'],
    oauth: { isAvailable: () => isAvailable(), signIn: (p: string) => signIn(p) },
  },
}));

const reportado: string[] = [];
vi.mock('@/lib/utils/reportFailure', () => ({
  FAILURE_TYPE_LABELS: {},
  reportFailure: (tipo: string) => {
    reportado.push(tipo);
  },
}));

import { AuthProvider, useAuth } from '@/components/AuthProvider';

function Botao() {
  const { signInWithApple } = useAuth();
  return (
    <button
      onClick={async () => {
        const r = await signInWithApple();
        const el = document.getElementById('saida');
        if (el) el.textContent = r.error ?? 'sem-erro';
      }}
    >
      entrar
    </button>
  );
}

async function tocarEntrar() {
  render(
    <AuthProvider>
      <Botao />
      <div id="saida" />
    </AuthProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('entrar'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  reportado.length = 0;
  signInWithOAuthSb.mockResolvedValue({ error: null });
});

afterEach(cleanup);

describe('login social dentro da casca nativa', () => {
  it('NÃO chama o signInWithOAuth do supabase quando o fluxo nativo diz unavailable', async () => {
    isNative.mockReturnValue(true);
    isAvailable.mockReturnValue(true);
    signIn.mockResolvedValue({ error: 'unavailable' });

    await tocarEntrar();

    // O ponto do teste: nada de navegação de WebView.
    expect(signInWithOAuthSb).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.getElementById('saida')?.textContent).toMatch(/Apple/),
    );
    // E a próxima ocorrência não vai depender de dedução.
    expect(reportado).toContain('oauth-fail');
  });

  it('também não cai pro web quando o plugin nem aparece na casca', async () => {
    isNative.mockReturnValue(true);
    isAvailable.mockReturnValue(false);

    await tocarEntrar();

    expect(signIn).not.toHaveBeenCalled();
    expect(signInWithOAuthSb).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.getElementById('saida')?.textContent).toMatch(
        /Feche e abra o app/,
      ),
    );
  });

  it('erro real do fluxo nativo é devolvido como está, sem tentar o web', async () => {
    isNative.mockReturnValue(true);
    isAvailable.mockReturnValue(true);
    signIn.mockResolvedValue({ error: 'Tempo esgotado. Tente entrar de novo.' });

    await tocarEntrar();

    expect(signInWithOAuthSb).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.getElementById('saida')?.textContent).toBe(
        'Tempo esgotado. Tente entrar de novo.',
      ),
    );
  });

  it('FORA da casca o fluxo web segue intocado', async () => {
    isNative.mockReturnValue(false);
    isAvailable.mockReturnValue(false);

    await tocarEntrar();

    expect(signInWithOAuthSb).toHaveBeenCalledTimes(1);
    const arg = signInWithOAuthSb.mock.calls[0][0] as {
      provider: string;
      options?: { skipBrowserRedirect?: boolean };
    };
    expect(arg.provider).toBe('apple');
    // O fluxo web é justamente o que navega o browser — sem skipBrowserRedirect.
    expect(arg.options?.skipBrowserRedirect).toBeUndefined();
    expect(reportado).not.toContain('oauth-fail');
  });

  it('sucesso do fluxo nativo navega pelo router, não por navegação de documento', async () => {
    isNative.mockReturnValue(true);
    isAvailable.mockReturnValue(true);
    signIn.mockResolvedValue({});

    await tocarEntrar();

    // Navegação de documento aqui pintaria a errorPath da casca ("Sem
    // conexão") logo depois de a pessoa concluir o login.
    expect(replace).toHaveBeenCalledWith('/completar-perfil');
    expect(signInWithOAuthSb).not.toHaveBeenCalled();
  });
});
