// Tests do service lib/services/brandLogos.ts — histórico de logos do pintor
// (tabela `brand_logos`), que é o que a tela Camisetas do /portal lê.
//
// Cobertura:
//   - recordBrandLogo: happy (linha com dono + source) → true; erro do
//     supabase → false (best-effort, NUNCA joga: o upload já deu certo);
//     args vazios → false sem tocar no banco.
//   - markBrandLogoApplied: filtra por user_id + image_url; erro é engolido.
//   - fetchMyBrandLogos: mapeia row → BrandLogo (source default 'ai',
//     applied_to_profile coerced pra boolean); erro → NetworkError.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __resetSupabaseForTests,
  __setSupabaseForTests,
} from '../../lib/supabase';
import {
  recordBrandLogo,
  markBrandLogoApplied,
  fetchMyBrandLogos,
} from '../../lib/services/brandLogos';
import { NetworkError } from '../../lib/errors';

interface Spies {
  from: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
}

function makeFakeClient(resp: { data?: unknown; error?: unknown } = {}) {
  const spies: Spies = {
    from: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  const settled = Promise.resolve({
    data: resp.data ?? null,
    error: resp.error ?? null,
  });
  const chain: Record<string, unknown> = {
    from: (t: string) => {
      spies.from(t);
      return chain;
    },
    insert: (row: Record<string, unknown>) => {
      spies.insert(row);
      return settled;
    },
    update: (patch: Record<string, unknown>) => {
      spies.update(patch);
      return chain;
    },
    select: (cols: string) => {
      spies.select(cols);
      return chain;
    },
    eq: (col: string, val: unknown) => {
      spies.eq(col, val);
      return chain;
    },
    order: (col: string, opts: unknown) => {
      spies.order(col, opts);
      return chain;
    },
    limit: (n: number) => {
      spies.limit(n);
      return settled;
    },
    then: (resolve: (v: unknown) => void) => settled.then(resolve),
  };
  return { client: chain, spies };
}

function install(resp: { data?: unknown; error?: unknown } = {}) {
  const { client, spies } = makeFakeClient(resp);
  __setSupabaseForTests(client as Parameters<typeof __setSupabaseForTests>[0]);
  return spies;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __resetSupabaseForTests();
  vi.restoreAllMocks();
});

describe('recordBrandLogo', () => {
  it('happy path: insere linha com dono, source e path', async () => {
    const spies = install();
    const ok = await recordBrandLogo({
      userId: 'u1',
      imageUrl: 'https://cdn/logo.png',
      storagePath: 'u1/logos/abc.png',
      source: 'upload',
      appliedToProfile: true,
    });
    expect(ok).toBe(true);
    expect(spies.from).toHaveBeenCalledWith('brand_logos');
    expect(spies.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      image_url: 'https://cdn/logo.png',
      storage_path: 'u1/logos/abc.png',
      source: 'upload',
      prompt_name: null,
      prompt_style: null,
      applied_to_profile: true,
    });
  });

  it('erro do supabase → false, sem jogar', async () => {
    install({ error: { message: 'rls' } });
    await expect(
      recordBrandLogo({ userId: 'u1', imageUrl: 'https://cdn/logo.png' }),
    ).resolves.toBe(false);
  });

  it('sem userId ou url → false sem tocar no banco', async () => {
    const spies = install();
    expect(await recordBrandLogo({ userId: '', imageUrl: 'x' })).toBe(false);
    expect(await recordBrandLogo({ userId: 'u1', imageUrl: '' })).toBe(false);
    expect(spies.insert).not.toHaveBeenCalled();
  });
});

describe('markBrandLogoApplied', () => {
  it('filtra por user_id + image_url', async () => {
    const spies = install();
    await markBrandLogoApplied('u1', 'https://cdn/logo.png');
    expect(spies.update).toHaveBeenCalledWith({ applied_to_profile: true });
    expect(spies.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(spies.eq).toHaveBeenCalledWith('image_url', 'https://cdn/logo.png');
  });

  it('erro do supabase não propaga', async () => {
    install({ error: { message: 'boom' } });
    await expect(
      markBrandLogoApplied('u1', 'https://cdn/logo.png'),
    ).resolves.toBeUndefined();
  });
});

describe('fetchMyBrandLogos', () => {
  it('mapeia rows e ordena por created_at desc', async () => {
    const spies = install({
      data: [
        {
          id: 'l1',
          user_id: 'u1',
          image_url: 'https://cdn/a.png',
          storage_path: 'u1/logos/a.png',
          source: null,
          prompt_name: 'Silva Pinturas',
          prompt_style: null,
          applied_to_profile: null,
          created_at: '2026-08-22T10:00:00Z',
        },
      ],
    });
    const rows = await fetchMyBrandLogos('u1');
    expect(spies.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(spies.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rows).toEqual([
      {
        id: 'l1',
        user_id: 'u1',
        image_url: 'https://cdn/a.png',
        storage_path: 'u1/logos/a.png',
        source: 'ai',
        prompt_name: 'Silva Pinturas',
        prompt_style: null,
        applied_to_profile: false,
        created_at: '2026-08-22T10:00:00Z',
      },
    ]);
  });

  it('sem userId → lista vazia', async () => {
    const spies = install();
    expect(await fetchMyBrandLogos('')).toEqual([]);
    expect(spies.from).not.toHaveBeenCalled();
  });

  it('erro do supabase → NetworkError', async () => {
    install({ error: { message: 'rls' } });
    await expect(fetchMyBrandLogos('u1')).rejects.toBeInstanceOf(NetworkError);
  });
});
