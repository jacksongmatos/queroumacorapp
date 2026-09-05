-- Tabela de Preços de Pintura ABRAPP 2026 — SCHEMA
-- ────────────────────────────────────────────────────────────────────────
-- Fonte: "Sugestão de Preços de Pintura 2026" da ABRAPP (Associação
-- Brasileira dos Pintores Profissionais) + Movimento Brasil por um Pintor
-- Melhor. 19 folhas de tabela, atualização janeiro/2026.
--
-- Regra que vale pra TODA linha: o valor é de MÃO DE OBRA, material NÃO
-- incluso. Cada item traz três faixas (média / mínimo / máximo) e, na
-- maioria das folhas, um eixo de altura (até 3m x acima de 3m).
--
-- Os DADOS vão no arquivo irmão `2026-09-05-tabela-precos-abrapp-dados.sql`
-- (rodar este primeiro).

CREATE TABLE IF NOT EXISTS public.price_table_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Edição da tabela. Existir como coluna permite subir a de 2027 ao lado
  -- da de 2026 sem apagar o histórico (o app filtra pela mais recente).
  edicao text NOT NULL DEFAULT 'ABRAPP 2026',
  -- Número da folha no PDF original (1..19). Serve de âncora quando alguém
  -- quiser conferir um valor contra o documento impresso.
  sheet_no int NOT NULL,
  -- Título da folha, ex.: 'Alvenarias e Paredes'. É o agrupador da UI.
  category text NOT NULL,
  -- Colunas 1 e 2 do PDF (PRODUTO / TIPO / SERVIÇO). Nulas nas folhas que
  -- têm só a descrição larga (combos, demarcação, drywall).
  grupo text,
  tipo text,
  -- Descrição do serviço, verbatim do PDF.
  servico text NOT NULL,
  -- Coluna "Observação"/"Altura" do PDF, verbatim.
  observacao text,
  -- Normalização do eixo de altura: 'ate_3m' | 'acima_3m' | NULL.
  -- Preenchida por UPDATE no fim do arquivo de dados — a UI filtra por ela.
  altura text CHECK (altura IN ('ate_3m', 'acima_3m')),
  -- Unidade de cobrança: m2 | metro_linear | unidade | diaria | km | rolo.
  unidade text NOT NULL,
  -- Preços em BRL. numeric pra não ter drift de float.
  preco_medio numeric NOT NULL CHECK (preco_medio >= 0),
  preco_min numeric CHECK (preco_min >= 0),
  preco_max numeric CHECK (preco_max >= 0),
  -- Ordem de exibição dentro da folha (segue a ordem impressa).
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Busca por texto do serviço. pg_trgm porque a consulta da tela é
-- "contém" (ILIKE %termo%), que índice b-tree não atende.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_price_table_servico_trgm
  ON public.price_table_items USING gin (servico gin_trgm_ops);

-- Chave de reexecução: a POSIÇÃO da linha na folha impressa.
-- Não usar (servico, observacao) como chave — a folha 3 tem duas linhas com
-- serviço E observação idênticos ("Maçarico deve ser usado…" / "m²"), uma em
-- Telhados e outra em Baldrame, com o mesmo preço; a segunda seria engolida
-- em silêncio. Posição é única por construção e faz o arquivo de dados virar
-- upsert: rodar de novo CORRIGE valor errado em vez de ignorar.
-- É também o índice da listagem — (edicao, sheet_no, sort_order) é
-- exatamente a ordem em que a tela lê a tabela, então um segundo índice nas
-- mesmas colunas só custaria escrita.
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_table_unique
  ON public.price_table_items (edicao, sheet_no, sort_order);

-- RLS: leitura liberada (é tabela de referência pública, igual products);
-- escrita só admin do portal.
ALTER TABLE public.price_table_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_table_select_all ON public.price_table_items;
CREATE POLICY price_table_select_all
  ON public.price_table_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS price_table_admin_write ON public.price_table_items;
CREATE POLICY price_table_admin_write
  ON public.price_table_items
  FOR ALL
  TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());
