// brandLogos.ts — histórico de logos do pintor (tabela `public.brand_logos`).
//
// Os logos gerados por IA já entram nessa tabela pelo servidor
// (`/api/generate-logo` → `persistBrandLogos`), porque só lá dá pra
// materializar o base64 do gpt-image-1 em arquivo. O que sobra pro cliente:
//   - registrar o logo que o pintor ENVIOU ("Já tenho meu logo");
//   - marcar qual linha virou o logo oficial do perfil;
//   - listar o histórico do próprio usuário.
//
// Tudo aqui é best-effort do ponto de vista da UX de camisetas: o logo do
// perfil é a fonte de verdade do preview, essa tabela é o histórico que a
// loja lê no /portal. Por isso `recordBrandLogo` e `markBrandLogoApplied`
// não estouram — falhar em registrar não pode impedir o pintor de usar o
// logo dele.

import { getSupabase } from '@/lib/supabase';
import { NetworkError } from '@/lib/errors';

export interface BrandLogo {
  id: string;
  user_id: string;
  image_url: string;
  storage_path: string | null;
  source: 'ai' | 'upload';
  prompt_name: string | null;
  prompt_style: string | null;
  applied_to_profile: boolean;
  created_at: string;
}

// Cast manual — tabela nova, ainda fora do schema TS gerado (mesmo padrão de
// art_references / product_variants).
interface AnyRow {
  id: string;
  user_id: string;
  image_url: string;
  storage_path: string | null;
  source: string | null;
  prompt_name: string | null;
  prompt_style: string | null;
  applied_to_profile: boolean | null;
  created_at: string;
}

type ErrorLike = { message: string } | null;

function logosClient() {
  return getSupabase() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (
            col: string,
            opts: { ascending: boolean }
          ) => {
            limit: (n: number) => PromiseLike<{
              data: AnyRow[] | null;
              error: ErrorLike;
            }>;
          };
        };
      };
      insert: (row: Record<string, unknown>) => PromiseLike<{
        error: ErrorLike;
      }>;
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => PromiseLike<{ error: ErrorLike }>;
        };
      };
    };
  };
}

function rowToLogo(r: AnyRow): BrandLogo {
  return {
    id: r.id,
    user_id: r.user_id,
    image_url: r.image_url,
    storage_path: r.storage_path,
    source: r.source === 'upload' ? 'upload' : 'ai',
    prompt_name: r.prompt_name,
    prompt_style: r.prompt_style,
    applied_to_profile: r.applied_to_profile === true,
    created_at: r.created_at,
  };
}

/**
 * Registra um logo enviado pelo pintor. Nunca estoura: o retorno diz se
 * gravou, e o caller decide se liga (hoje ninguém liga — o upload em si já
 * deu certo quando chegamos aqui).
 */
export async function recordBrandLogo(args: {
  userId: string;
  imageUrl: string;
  storagePath?: string | null;
  source?: 'ai' | 'upload';
  promptName?: string | null;
  promptStyle?: string | null;
  appliedToProfile?: boolean;
}): Promise<boolean> {
  const { userId, imageUrl } = args;
  if (!userId || !imageUrl) return false;
  try {
    const { error } = await logosClient()
      .from('brand_logos')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        storage_path: args.storagePath ?? null,
        source: args.source ?? 'upload',
        prompt_name: args.promptName ?? null,
        prompt_style: args.promptStyle ?? null,
        applied_to_profile: args.appliedToProfile ?? false,
      });
    if (error) {
      console.warn('recordBrandLogo:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('recordBrandLogo:', e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Marca no histórico qual logo virou o do perfil. Best-effort pelo mesmo
 * motivo: o `profiles.business_logo_url` já foi gravado quando isso roda.
 */
export async function markBrandLogoApplied(
  userId: string,
  imageUrl: string
): Promise<void> {
  if (!userId || !imageUrl) return;
  try {
    const { error } = await logosClient()
      .from('brand_logos')
      .update({ applied_to_profile: true })
      .eq('user_id', userId)
      .eq('image_url', imageUrl);
    if (error) console.warn('markBrandLogoApplied:', error.message);
  } catch (e) {
    console.warn('markBrandLogoApplied:', e instanceof Error ? e.message : e);
  }
}

/** Histórico do próprio usuário, mais recentes primeiro. */
export async function fetchMyBrandLogos(
  userId: string,
  limit = 50
): Promise<BrandLogo[]> {
  if (!userId) return [];
  const { data, error } = await logosClient()
    .from('brand_logos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new NetworkError(error.message, error);
  return (data || []).map(rowToLogo);
}
