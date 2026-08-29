-- ════════════════════════════════════════════════════════════════════
-- SQL Wave 49 (2026-08-29) — MÍDIA DO WHATSAPP no portal.
--
-- O evento do WhatsApp não traz o arquivo, só o aviso de que existe um.
-- Até agora o webhook gravava um marcador de texto ("[áudio]",
-- "[imagem]") e o arquivo ficava só no celular da loja — quem atendia
-- pelo portal respondia sem ter visto a foto da parede.
--
-- Agora o webhook guarda o arquivo no bucket `whatsapp-media` e, quando é
-- áudio, manda pro Whisper: a transcrição vai pra `transcript`, aparece
-- embaixo do player E entra no histórico que a IA lê (antes ela ficava
-- muda quando o cliente mandava voz).
--
-- O bucket é PRIVADO: é conversa de cliente, não conteúdo público. O
-- portal pede uma URL assinada na hora de mostrar.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Colunas na tabela de mensagens ──
ALTER TABLE public.whatsapp_messages
  -- caminho DENTRO do bucket (ex.: '5511988271552/3EB0C7.ogg'), não URL:
  -- URL assinada expira, então guardar ela no banco não serve pra nada.
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS transcript text;

-- ── 2. Bucket privado ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media', 'whatsapp-media', false, 15728640,
  ARRAY['image/jpeg','image/png','image/webp','image/gif',
        'audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav',
        'video/mp4','video/3gpp','video/quicktime',
        'application/pdf','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 3. Quem pode ler ──
-- Só o portal. A escrita é feita pelo webhook com service_role, que
-- ignora RLS — de propósito: ninguém logado precisa poder subir aqui.
DROP POLICY IF EXISTS "whatsapp-media portal read" ON storage.objects;
CREATE POLICY "whatsapp-media portal read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'whatsapp-media' AND public.is_portal_admin());

-- ── Verificação ──
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='whatsapp_messages' AND column_name='media_url')   AS col_media_url,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='whatsapp_messages' AND column_name='transcript')  AS col_transcript,
  (SELECT public FROM storage.buckets WHERE id='whatsapp-media')        AS bucket_publico_deve_ser_false,
  (SELECT count(*) FROM pg_policies
    WHERE tablename='objects' AND policyname='whatsapp-media portal read') AS policy_leitura;
