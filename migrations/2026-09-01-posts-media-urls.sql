-- Wave 57 (2026-09-01) — carrossel de fotos no post.
--
-- Até aqui o composer deixava escolher até 5 fotos, subia TODAS pro bucket
-- `posts` e gravava só a primeira em `posts.media_url`. As outras viravam
-- arquivo órfão: pagas em banda e storage, invisíveis pra todo mundo.
--
-- `media_url` NÃO muda de papel: continua sendo a primeira foto, e é o que
-- todo post antigo, o RPC `get_feed_v2` e o grid do perfil já leem. A coluna
-- nova guarda o conjunto, e o app só a usa quando tem mais de uma.
--
-- Curta de propósito: colar SQL grande pelo celular corta e emenda o bloco
-- (ver CLAUDE.md). São duas linhas.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls text[];

-- Índice não é necessário: a consulta do feed filtra por `id IN (...)`, que
-- já usa a PK, e `media_urls` só aparece na projeção.
