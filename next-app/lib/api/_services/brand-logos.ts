// lib/api/_services/brand-logos.ts — materializa os logos que a IA devolve
// em arquivos no Storage e registra cada um em `public.brand_logos`.
//
// Por que no servidor: o gpt-image-1 responde `b64_json`, então o que chegava
// no cliente era uma data URL de ~1.5MB. Salvar isso em
// `profiles.business_logo_url` (coluna text) funcionava por acidente, mas as
// variantes não escolhidas evaporavam e o /portal não tinha o que mostrar.
// Aqui o base64 vira PNG no bucket `posts` (já público pra leitura) sob
// `<userId>/logos/<uuid>.png` — o prefixo de userId é o que as policies de
// storage (Wave 27) exigem — e a linha em `brand_logos` guarda o dono e o
// prompt.
//
// Contrato de falha: NUNCA derruba a geração. Se o upload ou o insert
// falharem, devolvemos a imagem original (data URL) pro cliente e a tela
// segue funcionando como antes — o pintor não perde o logo que acabou de
// gerar por causa de um 500 do storage.

import * as Sentry from '@sentry/nextjs';
import { getServiceKey, getSupabaseUrl } from '../security';

const BUCKET = 'posts';

// Uma segunda tentativa por imagem. A regra do produto é "toda imagem gerada
// fica salva", e um 500 passageiro do storage não pode ser o motivo de uma
// arte sumir — a geração já custou ~40s e cota de IA, então +300ms de retry
// é barato perto de perder o arquivo.
const RETRY_DELAY_MS = 300;

async function withRetry<T>(
  label: string,
  fn: () => Promise<T | null>
): Promise<T | null> {
  const first = await fn();
  if (first !== null) return first;
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  const second = await fn();
  if (second === null) reportLoss(label);
  return second;
}

/**
 * Persistência é best-effort — mas silenciosa ela vira perda invisível.
 * Manda pro Sentry pra alguém ver que logos estão deixando de ser
 * arquivados. Fail-safe: falha do Sentry não pode derrubar a geração.
 */
function reportLoss(label: string, extra?: Record<string, unknown>): void {
  console.warn(`persistBrandLogos: ${label}`, extra ?? '');
  try {
    Sentry.captureMessage(`brand_logos: ${label}`, {
      level: 'warning',
      tags: { service: 'brand-logos' },
      extra,
    });
  } catch {
    /* Sentry off no edge — o console.warn acima já registrou. */
  }
}

export interface PersistBrandLogosArgs {
  /** Dono do logo. Sem ele não há o que registrar — devolve as imagens cruas. */
  userId: string | undefined;
  /** Imagens como vieram da IA: data URL base64 ou URL http. */
  images: string[];
  promptName?: string;
  promptStyle?: string;
}

/**
 * Decodifica `data:image/png;base64,...` em bytes. Null se não for data URL
 * OU se o base64 estiver corrompido — `atob` joga em padding inválido, e uma
 * imagem quebrada não pode derrubar a resposta inteira da geração.
 */
function decodeDataUrl(src: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:(image\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2].replace(/\s+/g, '');
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, mime };
  } catch {
    return null;
  }
}

/** Baixa uma URL http(s) da OpenAI e devolve os bytes. */
async function fetchBytes(
  src: string
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const mime = r.headers.get('content-type') || 'image/png';
    if (!mime.startsWith('image/')) return null;
    return { bytes: new Uint8Array(buf), mime };
  } catch {
    return null;
  }
}

function extFor(mime: string): string {
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'png';
}

/**
 * Sobe cada imagem no Storage e grava a linha em `brand_logos`.
 * Devolve as URLs finais na MESMA ordem de entrada — a original quando
 * a persistência daquela imagem falhou.
 */
export async function persistBrandLogos(
  args: PersistBrandLogosArgs
): Promise<string[]> {
  const { userId, images, promptName, promptStyle } = args;
  if (!userId || images.length === 0) return images;

  const serviceKey = getServiceKey();
  if (!serviceKey) {
    reportLoss('service role ausente — nenhum logo arquivado');
    return images;
  }
  let supaUrl: string;
  try {
    supaUrl = getSupabaseUrl();
  } catch {
    reportLoss('SUPABASE_URL ausente — nenhum logo arquivado');
    return images;
  }

  const rows: Array<Record<string, unknown>> = [];
  // TODAS as imagens da geração são arquivadas, independente do que o pintor
  // fizer depois — ele não precisa escolher, salvar nem pedir camiseta. É o
  // acervo da loja.
  const finalUrls = await Promise.all(
    images.map(async (src, i) => {
      const decoded = decodeDataUrl(src) ?? (await fetchBytes(src));
      if (!decoded) {
        reportLoss('imagem da IA ilegível (nem data URL nem download)', {
          index: i,
        });
        return src;
      }

      const path = `${userId}/logos/${crypto.randomUUID()}.${extFor(decoded.mime)}`;
      const uploaded = await withRetry(`upload falhou (imagem ${i + 1})`, async () => {
        try {
          const up = await fetch(`${supaUrl}/storage/v1/object/${BUCKET}/${path}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': decoded.mime,
              'x-upsert': 'true',
              'Cache-Control': 'public, max-age=31536000',
            },
            body: decoded.bytes.buffer as ArrayBuffer,
          });
          return up.ok ? true : null;
        } catch {
          return null;
        }
      });
      if (!uploaded) return src;

      const publicUrl = `${supaUrl}/storage/v1/object/public/${BUCKET}/${path}`;
      rows.push({
        user_id: userId,
        image_url: publicUrl,
        storage_path: path,
        source: 'ai',
        prompt_name: promptName || null,
        prompt_style: promptStyle || null,
      });
      return publicUrl;
    })
  );

  if (rows.length > 0) {
    // O arquivo já está no bucket; sem a linha aqui ele fica invisível pro
    // /portal. Por isso o insert também tem 2ª chance.
    await withRetry('insert em brand_logos falhou', async () => {
      try {
        const ins = await fetch(`${supaUrl}/rest/v1/brand_logos`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            // `merge-duplicates` porque o índice único (user_id,
            // md5(image_url)) pode bater no retry; duplicar não ajuda.
            Prefer: 'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(rows),
        });
        return ins.ok ? true : null;
      } catch {
        return null;
      }
    });
  }

  return finalUrls;
}
