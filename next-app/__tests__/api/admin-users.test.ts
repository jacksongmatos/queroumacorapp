// __tests__/api/admin-users.test.ts — testes do route handler.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function mkReq(body: unknown): NextRequest {
  return new Request('https://app.test/api/admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.ADMIN_EMAILS = 'boss@x.com';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe('POST /api/admin/users', () => {
  it('lookup (no action) returns users matching query', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'c', email: 'boss@x.com' }), { status: 200 })
        );
      }
      if (url.includes('/rpc/check_rate_limit')) {
        return Promise.resolve(new Response(JSON.stringify({ allowed: true }), { status: 200 }));
      }
      if (url.includes('/rest/v1/profiles')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 'u1', name: 'Foo' }]), { status: 200 })
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    const { POST } = await import('@/app/api/admin/users/route');
    const res = await POST(mkReq({ accessToken: 'good', query: 'foo' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users[0].id).toBe('u1');
  });

  it('promote action PATCHes portal_access=true when caller has portal_access', async () => {
    let patchBody = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'caller', email: 'boss@x.com' }), { status: 200 })
        );
      }
      if (url.includes('/rpc/check_rate_limit')) {
        return Promise.resolve(new Response(JSON.stringify({ allowed: true }), { status: 200 }));
      }
      // caller portal_access check
      if (url.includes('select=portal_access')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ portal_access: true }]), { status: 200 })
        );
      }
      if (url.includes('/rest/v1/profiles') && init?.method === 'PATCH') {
        patchBody = String(init.body);
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 'target' }]), { status: 200 })
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    const { POST } = await import('@/app/api/admin/users/route');
    const res = await POST(
      mkReq({ accessToken: 'good', action: 'promote', userId: 'target' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(patchBody).toContain('portal_access');
    expect(patchBody).toContain('true');
  });

  it('caller in ADMIN_EMAILS but without portal_access returns 403', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'caller', email: 'boss@x.com' }), { status: 200 })
        );
      }
      if (url.includes('/rpc/check_rate_limit')) {
        return Promise.resolve(new Response(JSON.stringify({ allowed: true }), { status: 200 }));
      }
      if (url.includes('select=portal_access')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ portal_access: false }]), { status: 200 })
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    const { POST } = await import('@/app/api/admin/users/route');
    const res = await POST(
      mkReq({ accessToken: 'good', action: 'promote', userId: 'target' })
    );
    expect(res.status).toBe(403);
  });

  it('sync_email reveals the Auth login email and mirrors it into profiles', async () => {
    let mirrorBody = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'caller', email: 'boss@x.com' }), { status: 200 })
        );
      }
      if (url.includes('/rpc/check_rate_limit')) {
        return Promise.resolve(new Response(JSON.stringify({ allowed: true }), { status: 200 }));
      }
      if (url.includes('/auth/v1/admin/users/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'target', email: 'Bianca@Mail.com' }), { status: 200 })
        );
      }
      if (url.includes('/rest/v1/profiles') && init?.method === 'PATCH') {
        mirrorBody = String(init.body);
        return Promise.resolve(new Response('[{"id":"target"}]', { status: 200 }));
      }
      if (url.includes('/rest/v1/profiles')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ portal_access: true }]), { status: 200 })
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    const { POST } = await import('@/app/api/admin/users/route');
    const res = await POST(mkReq({ accessToken: 'good', action: 'sync_email', userId: 'target' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe('bianca@mail.com');
    expect(body.source).toBe('auth');
    expect(JSON.parse(mirrorBody).email).toBe('bianca@mail.com');
  });

  it('sync_email 404s when the profile has no Auth login and no mirrored email', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'caller', email: 'boss@x.com' }), { status: 200 })
        );
      }
      if (url.includes('/rpc/check_rate_limit')) {
        return Promise.resolve(new Response(JSON.stringify({ allowed: true }), { status: 200 }));
      }
      if (url.includes('/auth/v1/admin/users/')) {
        return Promise.resolve(new Response('{"msg":"not found"}', { status: 404 }));
      }
      if (url.includes('/rest/v1/profiles') && url.includes('select=email')) {
        return Promise.resolve(new Response(JSON.stringify([{ email: null }]), { status: 200 }));
      }
      if (url.includes('/rest/v1/profiles')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ portal_access: true }]), { status: 200 })
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    const { POST } = await import('@/app/api/admin/users/route');
    const res = await POST(mkReq({ accessToken: 'good', action: 'sync_email', userId: 'orphan' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/órfão/);
  });

  it('invalid action returns 400', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'caller', email: 'boss@x.com' }), { status: 200 })
        );
      }
      if (url.includes('/rpc/check_rate_limit')) {
        return Promise.resolve(new Response(JSON.stringify({ allowed: true }), { status: 200 }));
      }
      // Sem esta linha o caller não tem portal_access e a rota devolve 403
      // ANTES de olhar a action — foi o que quebrou este teste. A ordem é
      // proposital (autorização antes de validar payload) e está coberta
      // pelo teste seguinte.
      if (url.includes('select=portal_access')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ portal_access: true }]), { status: 200 })
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    const { POST } = await import('@/app/api/admin/users/route');
    const res = await POST(
      mkReq({ accessToken: 'good', action: 'bogus', userId: 'target' })
    );
    expect(res.status).toBe(400);
  });

  it('caller sem portal_access leva 403 — autorização vem antes de validar a action', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'caller', email: 'boss@x.com' }), { status: 200 })
        );
      }
      if (url.includes('/rpc/check_rate_limit')) {
        return Promise.resolve(new Response(JSON.stringify({ allowed: true }), { status: 200 }));
      }
      if (url.includes('select=portal_access')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ portal_access: false }]), { status: 200 })
        );
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    const { POST } = await import('@/app/api/admin/users/route');
    const res = await POST(
      mkReq({ accessToken: 'good', action: 'promote', userId: 'target' })
    );
    expect(res.status).toBe(403);
  });
});
