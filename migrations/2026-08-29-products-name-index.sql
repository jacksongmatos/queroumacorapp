-- ============================================================
-- Wave 52 — indice de ordenacao do catalogo (products.name)
-- ============================================================
-- A tela de Produtos do portal lista o catalogo inteiro (21 mil linhas) em
-- paginas de 1000: sao ~22 requisicoes, TODAS com `ORDER BY name`. Sem
-- indice, cada uma delas obriga o Postgres a ordenar as 21 mil linhas de
-- novo so pra devolver a fatia pedida.
--
-- Com o indice, o ORDER BY ... LIMIT/OFFSET caminha direto pelo indice.
-- Barato (uma coluna de texto) e melhora tambem qualquer listagem futura
-- que ordene por nome.
--
-- CONCURRENTLY: nao trava a tabela enquanto cria (a loja do app le
-- `products` o tempo todo). Por isso NAO pode rodar dentro de um bloco de
-- transacao — cole e rode esta linha sozinha no SQL Editor.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name
  ON public.products (name);

-- Conferencia (opcional): deve aparecer "Index Scan using idx_products_name".
-- EXPLAIN ANALYZE SELECT id, name FROM public.products ORDER BY name LIMIT 1000 OFFSET 5000;
