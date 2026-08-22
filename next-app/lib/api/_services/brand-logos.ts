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

import { getServiceKey, getSupabaseUrl } from '../security';

const BUCKET = 'posts';

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
    console.warn('persistBrandLogos: service role ausente — logos não persistidos');
    return images;
  }
  let supaUrl: string;
  try {
    supaUrl = getSupabaseUrl();
  } catch {
    return images;
  }

  const rows: Array<Record<string, unknown>> = [];
  const finalUrls = await Promise.all(
    images.map(async (src) => {
      const decoded = decodeDataUrl(src) ?? (await fetchBytes(src));
      if (!decoded) return src;

      const path = `${userId}/logos/${crypto.randomUUID()}.${extFor(decoded.mime)}`;
      try {
        const up = await fetch(
          `${supaUrl}/storage/v1/object/${BUCKET}/${path}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': decoded.mime,
              'x-upsert': 'true',
              'Cache-Control': 'public, max-age=31536000',
            },
            body: decoded.bytes.buffer as ArrayBuffer,
          }
        );
        if (!up.ok) {
          console.warn('persistBrandLogos: upload falhou', up.status);
          return src;
        }
      } catch (e) {
        console.warn(
          'persistBrandLogos: upload exception',
          e instanceof Error ? e.message : e
        );
        return src;
      }

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
    try {
      const ins = await fetch(`${supaUrl}/rest/v1/brand_logos`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          // `merge-duplicates` porque o índice único (user_id, md5(image_url))
          // pode bater num retry; duplicar linha não ajuda ninguém.
          Prefer: 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      });
      if (!ins.ok) {
        console.warn(
          'persistBrandLogos: insert falhou',
          ins.status,
          (await ins.text()).slice(0, 200)
        );
      }
    } catch (e) {
      console.warn(
        'persistBrandLogos: insert exception',
        e instanceof Error ? e.message : e
      );
    }
  }

  return finalUrls;
}
