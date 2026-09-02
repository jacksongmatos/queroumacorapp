// @vitest-environment jsdom
//
// A1 (01/09/2026): o selo do topo era uma SEGUNDA fonte de verdade sobre
// "é PRO". Ele dizia PRO com `is_pro=true` sozinho; quem destranca as
// ferramentas (`canSeeProFeature`) exige `is_pro=true` E data futura quando
// há data. Como nada limpa `is_pro` no vencimento — não há cron nem trigger,
// e o portal ativa PRO gravando `is_pro=true` + expiração —, o estado
// "is_pro=true com data vencida" é PERMANENTE. Nele a pessoa via PRO na
// barra e levava "exclusivo do Plano PRO" ao tocar em qualquer ferramenta.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mockAuth: { user: { id: string; user_metadata?: Record<string, unknown> } | null } = {
  user: { id: 'u1', user_metadata: {} },
};
const mockProfile: { profile: Record<string, unknown> | null; loading: boolean } = {
  profile: null,
  loading: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/feed',
}));
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => mockAuth }));
vi.mock('@/lib/hooks/useProfile', () => ({
  useProfile: () => ({ profile: mockProfile.profile, loading: mockProfile.loading }),
}));
vi.mock('@/lib/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: () => ({ count: 0 }),
}));

import { TopNav } from '@/components/TopNav';

const ONTEM = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  mockAuth.user = { id: 'u1', user_metadata: {} };
  mockProfile.loading = false;
});
afterEach(cleanup);

describe('TopNav — selo PRO usa a MESMA regra que tranca as ferramentas', () => {
  it('PRO vencido NÃO mostra selo PRO (era o bug: selo PRO + ferramentas trancadas)', () => {
    mockProfile.profile = { id: 'u1', is_pro: true, pro_expires_at: ONTEM };
    render(<TopNav />);
    expect(screen.queryByText('PRO')).toBeNull();
    expect(screen.getByText('GRÁTIS')).toBeTruthy();
  });

  it('PRO dentro da validade mostra PRO', () => {
    mockProfile.profile = { id: 'u1', is_pro: true, pro_expires_at: AMANHA };
    render(<TopNav />);
    expect(screen.getByText('PRO')).toBeTruthy();
  });

  it('vencido mas dentro do grace period ainda é PRO', () => {
    mockProfile.profile = {
      id: 'u1',
      is_pro: true,
      pro_expires_at: ONTEM,
      pro_grace_until: AMANHA,
    };
    render(<TopNav />);
    expect(screen.getByText('PRO')).toBeTruthy();
  });

  it('is_pro=true sem data nenhuma segue PRO (ativação manual da loja)', () => {
    mockProfile.profile = { id: 'u1', is_pro: true };
    render(<TopNav />);
    expect(screen.getByText('PRO')).toBeTruthy();
  });

  it('admin vence tudo', () => {
    mockProfile.profile = { id: 'u1', is_pro: false, portal_access: true };
    render(<TopNav />);
    expect(screen.getByText('ADMIN')).toBeTruthy();
  });

  it('sem profile carregado não chuta GRÁTIS', () => {
    mockProfile.profile = null;
    mockProfile.loading = true;
    render(<TopNav />);
    expect(screen.queryByText('GRÁTIS')).toBeNull();
  });
});
