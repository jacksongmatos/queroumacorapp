-- Tabela de Preços de Pintura ABRAPP 2026 — DADOS (folhas 1 a 19)
-- ────────────────────────────────────────────────────────────────────────
-- Rodar DEPOIS de `2026-09-05-tabela-precos-abrapp.sql` (schema).
--
-- Cada bloco abaixo é UMA folha do PDF e pode ser colado sozinho — o índice
-- único (edicao, sheet_no, sort_order) + ON CONFLICT DO UPDATE torna cada
-- bloco repetível: rodar duas vezes não duplica, e rodar de novo depois de
-- corrigir um valor aqui ATUALIZA a linha no banco. Isso é de propósito:
-- colar SQL grande pelo celular corta bloco no meio, e reexecutar tem que
-- ser inofensivo.
--
-- Textos são VERBATIM do PDF, inclusive onde ele repete uma palavra que
-- parece errada (folha 1: "Telhado Baixo" nas duas linhas de lavagem de
-- telhado). Corrigir aqui faria o app divergir do documento que o pintor
-- tem impresso.
--
-- O UPDATE do fim preenche `altura` a partir da observação — não repetir
-- essa informação em cada linha encurta o arquivo e evita divergência.

-- ── FOLHA 1 — Diárias, Lavagens e Limpeza ──────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(1,'Diárias, Lavagens e Limpeza','Diária','Ajudante','Serviço básico - 8hs','Diária','diaria',124.49,104.84,144.15,1),
(1,'Diárias, Lavagens e Limpeza','Diária','Profissional','Serviços gerais de pintura - 8hs','Diária','diaria',216.22,170.36,262.09,2),
(1,'Diárias, Lavagens e Limpeza','Diária','Líder','Pintor Profissional Líder - 8hs','Diária','diaria',248.99,209.67,288.30,3),
(1,'Diárias, Lavagens e Limpeza','Diária','Cordeiro','Pintor Ajudante Cordeiro/Cadeirinha - 8hs','Diária','diaria',235.88,196.57,275.19,4),
(1,'Diárias, Lavagens e Limpeza','Diária','Cordeiro','Pintor Profissional Cordeiro/Cadeirinha - 8hs','Diária','diaria',301.40,262.09,340.72,5),
(1,'Diárias, Lavagens e Limpeza','Diária','Proprietário','c/Ferramentas, equipamentos e certificados','Diária','diaria',353.82,288.30,419.34,6),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Tijolinho','Lavagem Tijolinho para aplicação de Silicone (m²)','até 3 metros altura','m2',5.52,3.88,7.16,7),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Calhas','Lavagem Calha Telhado Simples (metro linear)','até 3 metros altura','metro_linear',14.74,11.89,17.59,8),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Calhas','Lavagem Calha - Sobrado (metro linear)','acima 3 metros','metro_linear',23.30,17.47,29.12,9),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Pingadeiras','Lavagem de pingadeiras para muros (metro linear)','metro linear','metro_linear',10.19,7.16,13.23,10),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Caixa D''água','Lavagem Caixa D''água Telhado Baixo (unidade)','até 3 metros altura','unidade',232.85,174.61,291.09,11),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Caixa D''água','Lavagem Caixa D''água Telhado Alto (unidade)','acima 3 metros','unidade',349.21,262.09,436.33,12),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Telhado','Lavagem Telhado Baixo com Lavadora Pressurizada (m²)','até 3 metros altura','m2',14.56,10.19,18.93,13),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Telhado','Lavagem Telhado Baixo com Lavadora Pressurizada (m²)','acima 3 metros','m2',18.87,14.44,23.30,14),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Parede e Muro','Lavagem da parede - sujeiras em geral (m²)','até 3 metros altura','m2',4.85,3.28,6.43,15),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Parede e Muro','Lavagem da parede - sujeiras em geral (m²)','acima 3 metros','m2',12.32,7.16,17.47,16),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Piso','Lavagem Piso Simples - Mangueira (m²)','só lavagem','m2',5.56,4.27,6.85,17),
(1,'Diárias, Lavagens e Limpeza','Lavagem','Piso','Lavagem Piso Máquina - Água Pressurizada (m²)','só lavagem','m2',9.16,7.30,11.01,18),
(1,'Diárias, Lavagens e Limpeza','Distancia Obra','Localização','A distância será calculada por kilometros (km)','Use o Google Mapas','km',8.68,5.82,11.53,19)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 2 — Serviços Diversos ────────────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(2,'Serviços Diversos','Telhas','Resina Acrílica','Resinar Telhas em Geral 2 demãos (m²)','Lavagem incluso','m2',25.12,19.66,30.58,1),
(2,'Serviços Diversos','Telhas','Resina Acrílica','Resinar Telhas em Geral 3 demãos (m²)','Lavagem incluso','m2',32.09,24.87,39.31,2),
(2,'Serviços Diversos','Telhas','Resina Acrílica','Resinar Telhas Fibrocimento ou Amianto (m²)','Pouco Madeiramento','m2',37.86,29.12,46.59,3),
(2,'Serviços Diversos','Calhas','Pintura','Pintura Calha - Telhado Simples (metro linear)','até 3 metros altura','metro_linear',32.64,24.75,40.53,4),
(2,'Serviços Diversos','Calhas','Pintura','Pintura Calha - Sobrado (metro linear)','acima 3 metros','metro_linear',40.77,30.58,50.96,5),
(2,'Serviços Diversos','Pingadeiras','Pintura','Pintura de pingadeiras para muros (metro linear)','metro linear','metro_linear',19.72,11.89,27.54,6),
(2,'Serviços Diversos','Porcelanato Líquido','Epóxi','Tinta Epóxi (Alta espessura) Industrial (m²)','Fundo + Acabamento','m2',305.47,232.73,378.21,7),
(2,'Serviços Diversos','Porcelanato Líquido','Epóxi','Tinta Epóxi (Alta espessura) 3D e Artístico (m²)','Fundo + Acab + Adesivo','m2',436.39,363.65,509.13,8),
(2,'Serviços Diversos','Buracos','Cimento','Acerto com cimento em parede - Grandes correções (m²)','até 3 metros altura','m2',19.66,11.77,27.54,9),
(2,'Serviços Diversos','Fissuras','Selante','Fissuras - Selante para trincas (metro linear)','até 3 metros altura','metro_linear',12.26,10.07,14.44,10),
(2,'Serviços Diversos','Trincas','Tela','Trincas - Tela e Massa (metro linear)','até 3 metros altura','metro_linear',24.02,18.93,29.12,11),
(2,'Serviços Diversos','Papel Parede','Rolo','Aplicação Papel de Parede Comum (por rolo)','até 3 metros altura','rolo',98.16,79.96,116.36,12),
(2,'Serviços Diversos','Papel Parede','Rolo','Aplicação Papel de Parede Comum (por rolo)','acima 3 metros','rolo',149.12,123.64,174.61,13),
(2,'Serviços Diversos','Papel Parede','Rolo','Aplicação Papel de Parede Importado (por rolo)','até 3 metros altura','rolo',134.50,109.08,159.92,14),
(2,'Serviços Diversos','Papel Parede','Rolo','Aplicação Papel de Parede Importado (por rolo)','acima 3 metros','rolo',196.39,174.61,218.17,15),
(2,'Serviços Diversos','Papel Parede','Líquido','Aplicação Papel Parede Liquido Importado (m²)','até 3 metros altura','m2',112.72,79.96,145.48,16),
(2,'Serviços Diversos','Piscina','P.U Poliuretano','Pintura de Piscina (Repintura simples) 2 Demãos (m²)','Somente pintura','m2',196.57,157.25,235.88,17),
(2,'Serviços Diversos','Piscina','P.U Poliuretano','Pintura de Piscina (Pintura completa) 3 Demãos (m²)','Somente pintura','m2',262.09,222.78,301.40,18)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 3 — Impermeabilização ────────────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(3,'Impermeabilização','Fachada','Tinta Elástica Emborrachada','Tinta Impermeabilizante 2 demãos (m²) lavagem não incluso','até 3 metros altura','m2',20.20,14.44,25.97,1),
(3,'Impermeabilização','Fachada','Tinta Elástica Emborrachada','Tinta Impermeabilizante 2 demãos (m²) lavagem não incluso','acima 3 metros','m2',28.58,20.87,36.28,2),
(3,'Impermeabilização','Fachada','Tinta Elástica Emborrachada','Tinta Impermeabilizante 3 demãos (m²) lavagem não incluso','até 3 metros altura','m2',22.14,15.77,28.51,3),
(3,'Impermeabilização','Fachada','Tinta Elástica Emborrachada','Tinta Impermeabilizante 3 demãos (m²) lavagem não incluso','acima 3 metros','m2',28.58,20.87,36.28,4),
(3,'Impermeabilização','Rodapé','Massa Corrida','Tratamento de umidades ascendente - pouca umidade','m²','m2',30.21,17.23,43.20,5),
(3,'Impermeabilização','Rodapé','Argamassa','Tratamento de umidades ascendente - muita umidade','m²','m2',78.87,60.67,97.07,6),
(3,'Impermeabilização','Telhados','Manta Líquida','Manta Liquida Fria Emborrachada Flexível (3 demãos)','Lavagem incluso','m2',37.86,29.12,46.59,7),
(3,'Impermeabilização','Telhados','Manta Asfáltica','Maçarico deve ser usado somente por profissional especializado','m²','m2',78.87,60.67,97.07,8),
(3,'Impermeabilização','Telhados','Fita Aluminizada','Colagem a frio - Auto adesiva','Metro linear','metro_linear',37.86,29.12,46.59,9),
(3,'Impermeabilização','Laje','Manta Líquida','Manta Liquida Fria Emborrachada Flexível (3 demãos)','Lavagem incluso','m2',37.86,29.12,46.59,10),
(3,'Impermeabilização','Piscinas','Manta Líquida','Tratamento de umidades ascendente - muita umidade','Lavagem incluso','m2',37.86,29.12,46.59,11),
(3,'Impermeabilização','Piscinas','Argamassa','Tratamento de umidades ascendente - muita umidade','m²','m2',78.87,60.67,97.07,12),
(3,'Impermeabilização','Calhas','Manta Líquida','Calhetões de Alvenaria','Lavagem incluso','m2',37.86,29.12,46.59,13),
(3,'Impermeabilização','Baldrame','Pintura Asfáltica','Membrana para alicerces, baldrames e muros','m²','m2',9.53,7.28,11.77,14),
(3,'Impermeabilização','Baldrame','Argamassa','Tratamento de umidades ascendente','m²','m2',44.90,36.40,53.39,15),
(3,'Impermeabilização','Baldrame','Fita Baldrame','Fita asfáltica pré-fabricada aplicada a frio + Primer/fundo','Metro linear','metro_linear',37.86,29.12,46.59,16),
(3,'Impermeabilização','Baldrame','Manta Asfáltica','Maçarico deve ser usado somente por profissional especializado','m²','m2',78.87,60.67,97.07,17),
(3,'Impermeabilização','Selante Silicone','Juntas / Vedação / Mastique','Selante PU ou Silicone Acéptico para juntas (Metro Linear)','até 3 metros altura','metro_linear',5.76,4.25,7.28,18),
(3,'Impermeabilização','Selante Silicone','Juntas / Vedação / Mastique','Selante PU ou Silicone Acéptico para juntas (Metro Linear)','acima 3 metros','metro_linear',7.46,5.46,9.46,19)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 4 — Alvenarias e Paredes ─────────────────────────────────────
-- "Econônico" e "chapisto" são erros de digitação DO PDF, mantidos verbatim.
-- Quem procurar "econômico"/"chapisco" acha assim mesmo: as colunas grupo e
-- tipo trazem os termos escritos certo.
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(4,'Alvenarias e Paredes','Látex','Acrílico Econômico','Econônico Fosco 2 demãos (m²)','até 3 metros altura','m2',14.86,10.31,19.41,1),
(4,'Alvenarias e Paredes','Látex','Acrílico Econômico','Econônico Fosco 2 demãos (m²)','acima 3 metros','m2',17.59,12.98,22.20,2),
(4,'Alvenarias e Paredes','Látex','Acrílico Econômico','Econônico Fosco 3 demãos (m²)','até 3 metros altura','m2',20.20,14.44,25.97,3),
(4,'Alvenarias e Paredes','Látex','Acrílico Econômico','Econônico Fosco 3 demãos (m²)','acima 3 metros','m2',24.93,17.47,32.40,4),
(4,'Alvenarias e Paredes','Látex','Acrílico Standard','Standard Fosco 2 demãos (m²)','até 3 metros altura','m2',16.26,11.65,20.87,5),
(4,'Alvenarias e Paredes','Látex','Acrílico Standard','Standard Fosco 2 demãos (m²)','acima 3 metros','m2',18.50,14.20,22.81,6),
(4,'Alvenarias e Paredes','Látex','Acrílico Standard','Standard Fosco 3 demãos (m²)','até 3 metros altura','m2',22.27,15.65,28.88,7),
(4,'Alvenarias e Paredes','Látex','Acrílico Standard','Standard Fosco 3 demãos (m²)','acima 3 metros','m2',26.51,19.17,33.85,8),
(4,'Alvenarias e Paredes','Látex','Acrílico Premium e Acrílico Super Premium','Premium Fosco 3 demãos (m²)','até 3 metros altura','m2',20.20,14.44,25.97,9),
(4,'Alvenarias e Paredes','Látex','Acrílico Premium e Acrílico Super Premium','Premium Fosco 3 demãos (m²)','acima 3 metros','m2',28.58,20.87,36.28,10),
(4,'Alvenarias e Paredes','Látex','Acrílico Premium e Acrílico Super Premium','Premium Acetinado 3 demãos (m²)','até 3 metros altura','m2',25.58,19.05,32.11,11),
(4,'Alvenarias e Paredes','Látex','Acrílico Premium e Acrílico Super Premium','Premium Acetinado 3 demãos (m²)','acima 3 metros','m2',29.91,22.08,37.74,12),
(4,'Alvenarias e Paredes','Látex','Acrílico Premium e Acrílico Super Premium','Premium Semi Brilho 3 demãos (m²)','até 3 metros altura','m2',28.21,20.38,36.04,13),
(4,'Alvenarias e Paredes','Látex','Acrílico Premium e Acrílico Super Premium','Premium Semi Brilho 3 demãos (m²)','acima 3 metros','m2',29.00,21.72,36.28,14),
(4,'Alvenarias e Paredes','Pinturas Específicas','Adicional','Demão adicional de qualquer tinta (m²)','até 3 metros altura','m2',14.86,10.31,19.41,15),
(4,'Alvenarias e Paredes','Pinturas Específicas','Cal','Muros já limpos 1 demão Cal (m²)','até 3 metros altura','m2',11.41,9.46,13.35,16),
(4,'Alvenarias e Paredes','Pinturas Específicas','Gesso 3D','Parede Gesso 3D (Massa + Pintura) m²','até 3 metros altura','m2',79.29,58.24,100.35,17),
(4,'Alvenarias e Paredes','Pinturas Específicas','Chapisco','Pintura em chapisto, grafiato, parede porosa (m²)','até 3 metros altura','m2',29.79,20.38,39.19,18),
(4,'Alvenarias e Paredes','Fundo','Acrílico','Fundo Preparador (gruda partes soltas) m²','até 3 metros altura','m2',9.53,7.28,11.77,19),
(4,'Alvenarias e Paredes','Selador','Acrílico','Fundo Selador Acrílico (usar somente parede nova sem pintura) m²','até 3 metros altura','m2',9.53,7.28,11.77,20),
(4,'Alvenarias e Paredes','Remoção','Restauração','Descascar / Remover tinta e textura antiga (m²)','até 3 metros altura','m2',7.64,6.43,8.86,21),
(4,'Alvenarias e Paredes','Remoção','Restauração','Remoção de pintura com Lixamento (m²)','até 3 metros altura','m2',9.10,7.77,10.44,22),
(4,'Alvenarias e Paredes','Remoção','Restauração','Remoção de pintura com produto químico (m²)','até 3 metros altura','m2',10.37,9.10,11.65,23),
(4,'Alvenarias e Paredes','Verniz','Acrílico','Resina Protetora ou Liqui-Brilho para Parede e Concreto (m²)','até 3 metros altura','m2',11.41,10.31,12.50,24),
(4,'Alvenarias e Paredes','Silicone','Acquela','Silicone Acquela em Tijolos / Tijolinho Bahiano (m²)','até 3 metros altura','m2',11.41,10.31,12.50,25)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 5 — Massas e Preenchimentos ──────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(5,'Massas e Preenchimentos','Massa','Corrida','Gesso / Superfícies boas condições / Repintura (já selada) 2 demãos (m²)','até 3 metros altura','m2',16.99,10.44,23.54,1),
(5,'Massas e Preenchimentos','Massa','Corrida','Gesso / Superfícies boas condições / Repintura (já selada) 2 demãos (m²)','acima 3 metros','m2',19.05,11.89,26.21,2),
(5,'Massas e Preenchimentos','Massa','Corrida','Gesso / Superfícies boas condições / Repintura (já selada) 3 demãos (m²)','até 3 metros altura','m2',23.30,13.10,33.49,3),
(5,'Massas e Preenchimentos','Massa','Corrida','Gesso / Superfícies boas condições / Repintura (já selada) 3 demãos (m²)','acima 3 metros','m2',26.09,15.53,36.64,4),
(5,'Massas e Preenchimentos','Massa','Corrida','Reboco / Superfícies irregulares (já selada) 2 demãos (m²)','até 3 metros altura','m2',18.99,11.77,26.21,5),
(5,'Massas e Preenchimentos','Massa','Corrida','Reboco / Superfícies irregulares (já selada) 2 demãos (m²)','acima 3 metros','m2',23.48,13.10,33.85,6),
(5,'Massas e Preenchimentos','Massa','Corrida','Reboco / Superfícies irregulares (já selada) 3 demãos (m²)','até 3 metros altura','m2',26.21,14.56,37.86,7),
(5,'Massas e Preenchimentos','Massa','Corrida','Reboco / Superfícies irregulares (já selada) 3 demãos (m²)','acima 3 metros','m2',29.49,15.77,43.20,8),
(5,'Massas e Preenchimentos','Massa','Acrílica','Gesso / Superfícies boas condições / Repintura (já selada) 2 demãos (m²)','até 3 metros altura','m2',24.88,15.35,34.40,9),
(5,'Massas e Preenchimentos','Massa','Acrílica','Gesso / Superfícies boas condições / Repintura (já selada) 2 demãos (m²)','acima 3 metros','m2',27.67,16.69,38.65,10),
(5,'Massas e Preenchimentos','Massa','Acrílica','Gesso / Superfícies boas condições / Repintura (já selada) 3 demãos (m²)','até 3 metros altura','m2',31.37,18.26,44.47,11),
(5,'Massas e Preenchimentos','Massa','Acrílica','Gesso / Superfícies boas condições / Repintura (já selada) 3 demãos (m²)','acima 3 metros','m2',34.22,19.72,48.72,12),
(5,'Massas e Preenchimentos','Massa','Acrílica','Reboco / Superfícies irregulares (já selada) 2 demãos (m²)','até 3 metros altura','m2',26.21,16.69,35.74,13),
(5,'Massas e Preenchimentos','Massa','Acrílica','Reboco / Superfícies irregulares (já selada) 2 demãos (m²)','acima 3 metros','m2',29.55,18.02,41.08,14),
(5,'Massas e Preenchimentos','Massa','Acrílica','Reboco / Superfícies irregulares (já selada) 3 demãos (m²)','até 3 metros altura','m2',32.46,19.48,45.44,15),
(5,'Massas e Preenchimentos','Massa','Acrílica','Reboco / Superfícies irregulares (já selada) 3 demãos (m²)','acima 3 metros','m2',35.80,20.93,50.66,16)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 6 — Efeitos Decorativos ──────────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Cimento Queimado Fosco (m²)','até 3 metros altura','m2',78.63,52.42,104.84,1),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Cimento Queimado Polído (m²)','até 3 metros altura','m2',111.69,72.68,150.70,2),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Cimento Queimado fosco para Piso (m²)','até 3 metros altura','m2',91.71,61.14,122.28,3),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Cimento Queimado Polído para Piso (m²)','até 3 metros altura','m2',130.28,84.78,175.78,4),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Mármore Tradicional (m²)','até 3 metros altura','m2',119.28,78.63,159.92,5),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Marmorato / Marmorização personalizada (m²)','até 3 metros altura','m2',147.67,91.73,203.61,6),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Granito, Mesclado, Marroquino (m²)','até 3 metros altura','m2',176.06,104.84,247.29,7),
(6,'Efeitos Decorativos','Efeitos','Tinta','Marmorizado com tinta / Gel envelhecedor (m²)','até 3 metros altura','m2',83.66,65.52,101.80,8),
(6,'Efeitos Decorativos','Efeitos','Tinta','Aço Corten em Alvenaria (m²)','até 3 metros altura','m2',153.05,101.12,204.98,9),
(6,'Efeitos Decorativos','Efeitos','Tinta','Madeira Lisa em Alvenaria (m²)','até 3 metros altura','m2',83.60,50.84,116.36,10),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Madeira Rustica em Alvenaria (m²)','até 3 metros altura','m2',94.52,72.68,116.36,11),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Madeira Esculpida em Alvenaria (m²)','até 3 metros altura','m2',130.92,87.24,174.61,12),
(6,'Efeitos Decorativos','Efeitos','Massa / Argamassa','Madeira Esculpida (Demolição) em Alvenaria (m²)','até 3 metros altura','m2',152.76,116.36,189.17,13),
(6,'Efeitos Decorativos','Efeitos','Tinta','Trapeado / Linho / Jeans (m²)','até 3 metros altura','m2',54.60,43.68,65.52,14),
(6,'Efeitos Decorativos','Efeitos','Tinta','Patina Comum (m²)','até 3 metros altura','m2',65.46,43.68,87.24,15),
(6,'Efeitos Decorativos','Efeitos','Tinta','Patina Demolição + Variações (m²)','até 3 metros altura','m2',76.38,50.96,101.80,16),
(6,'Efeitos Decorativos','Efeitos','Tinta','Patina Alta Resistencia (m²)','até 3 metros altura','m2',90.94,65.52,116.36,17),
(6,'Efeitos Decorativos','Efeitos','Tinta','Aço Corten em Pergolados (metro linear)','até 3 metros altura','metro_linear',90.94,65.52,116.36,18),
(6,'Efeitos Decorativos','Efeitos','Tinta','Madeira Lisa em Pergolados (metro linear)','até 3 metros altura','metro_linear',101.86,72.68,131.05,19)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 7 — Texturas Diversas 1 ──────────────────────────────────────
-- As duas últimas linhas vêm com "acima 3 metros" ANTES de "até 3 metros"
-- no impresso. A ordem é mantida (sort_order = ordem da folha).
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(7,'Texturas Diversas 1','Textura','Grossa','Rústica, Grafiatto + Selar ou Pintar (m²)','até 3 metros altura','m2',28.58,19.66,37.49,1),
(7,'Texturas Diversas 1','Textura','Grossa','Rústica, Grafiatto + Selar ou Pintar (m²)','acima 3 metros','m2',38.16,24.15,52.18,2),
(7,'Texturas Diversas 1','Textura','Grossa','Rústica, Grafiatto + Gel Envelhecedor (m²)','até 3 metros altura','m2',33.85,22.08,45.62,3),
(7,'Texturas Diversas 1','Textura','Média','Textura Rolada, Textura de Rolo, Textura Design - Superfície nova (m²)','até 3 metros altura','m2',21.48,16.99,25.97,4),
(7,'Texturas Diversas 1','Textura','Média','Textura Rolada, Textura de Rolo, Textura Design - Superfície nova (m²)','acima 3 metros','m2',27.42,20.99,33.85,5),
(7,'Texturas Diversas 1','Textura','Média','Textura Rolada, Textura de Rolo, Textura Design - Superfície com problema (m²)','até 3 metros altura','m2',29.24,20.99,37.49,6),
(7,'Texturas Diversas 1','Textura','Média','Textura Rolada, Textura de Rolo, Textura Design - Superfície com problema (m²)','acima 3 metros','m2',36.22,28.88,43.56,7),
(7,'Texturas Diversas 1','Textura','Média','Projetada + Selar (m²)','até 3 metros altura','m2',36.04,25.97,46.11,8),
(7,'Texturas Diversas 1','Textura','Média','Projetada + Selar (m²)','acima 3 metros','m2',41.98,31.79,52.18,9),
(7,'Texturas Diversas 1','Textura','Média','Projetada + Pintura ou Gel Envelhecedor (m²)','até 3 metros altura','m2',46.99,36.35,57.64,10),
(7,'Texturas Diversas 1','Textura','Média','Riscado / Granfino + Selar e Pintar (m²)','até 3 metros altura','m2',26.88,14.56,39.19,11),
(7,'Texturas Diversas 1','Textura','Média','Riscado / Granfino + Selar e Pintar (m²)','acima 3 metros','m2',38.59,20.38,56.79,12),
(7,'Texturas Diversas 1','Textura','Média','Riscado / Granfino + Gel Envelhecedor (m²)','até 3 metros altura','m2',33.37,18.81,47.93,13),
(7,'Texturas Diversas 1','Textura','Média','Personalizado Diversos + Gel Envelhecedor (m²)','até 3 metros altura','m2',39.13,23.05,55.21,14),
(7,'Texturas Diversas 1','Textura','Lisa','Rolada, Textura de Rolo + Selar ou Pintar (m²)','até 3 metros altura','m2',21.78,14.56,29.00,15),
(7,'Texturas Diversas 1','Textura','Lisa','Rolada, Textura de Rolo + Selar ou Pintar (m²)','acima 3 metros','m2',28.33,16.02,40.65,16),
(7,'Texturas Diversas 1','Textura','Lisa','Personalizado Diversos + Gel Envelhecedor (m²)','até 3 metros altura','m2',39.25,23.30,55.21,17),
(7,'Texturas Diversas 1','Textura','Todas','Remoção Textura em geral (m²)','acima 3 metros','m2',17.47,14.56,20.38,18),
(7,'Texturas Diversas 1','Textura','Todas','Remoção Textura em geral (m²)','até 3 metros altura','m2',20.38,17.47,23.30,19)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 8 — Texturas Diversas 2 ──────────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(8,'Texturas Diversas 2','Efeitos','Textura','Textura Projetada Fulget (m²)','até 3 metros altura','m2',65.52,52.42,78.63,1),
(8,'Texturas Diversas 2','Efeitos','Textura','Textura Projetada Fulget (m²)','acima de 3 metros','m2',75.35,65.52,85.18,2),
(8,'Texturas Diversas 2','Efeitos','Pedras Naturais','Cristal, Lamato, Arenito, Cristaline, Grafiato, Granfino, Lamato e Quartzo (m²)','até 3 metros altura','m2',81.50,65.52,97.48,3),
(8,'Texturas Diversas 2','Efeitos','Pedras Naturais','Cristal, Lamato, Arenito, Cristaline, Grafiato, Granfino, Lamato e Quartzo (m²)','acima de 3 metros','m2',91.73,78.63,104.84,4),
(8,'Texturas Diversas 2','Efeitos','Textura','Velvet da Tintas Coral (m²)','até 3 metros altura','m2',145.73,116.36,175.09,5),
(8,'Texturas Diversas 2','Efeitos','Textura','Nuage Tintas Coral (m²)','até 3 metros altura','m2',127.53,79.96,175.09,6),
(8,'Texturas Diversas 2','Efeitos','Textura','Pietra Ibratin (m²)','até 3 metros altura','m2',110.66,79.96,141.36,7),
(8,'Texturas Diversas 2','Efeitos','Textura','Perlato Ibratin (m²)','até 3 metros altura','m2',110.66,79.96,141.36,8),
(8,'Texturas Diversas 2','Efeitos','Textura','Bronzato Ibratin (m²)','até 3 metros altura','m2',138.72,109.08,168.36,9),
(8,'Texturas Diversas 2','Efeitos','Textura','Cristalinne Ibratin (m²)','até 3 metros altura','m2',65.83,50.84,80.81,10),
(8,'Texturas Diversas 2','Efeitos','Textura','Stelatto Ibratin (m²)','até 3 metros altura','m2',98.16,79.96,116.36,11),
(8,'Texturas Diversas 2','Efeitos','Textura','Stucco Fosco Ibratin (m²)','até 3 metros altura','m2',69.04,50.84,87.24,12),
(8,'Texturas Diversas 2','Efeitos','Textura','Stucco Veneziano Ibratin (m²)','até 3 metros altura','m2',98.16,79.96,116.36,13),
(8,'Texturas Diversas 2','Efeitos','Pintura','Pintura 3D Simples com tinta (Lisa, sem gesso) m²','até 3 metros altura','m2',69.04,50.84,87.24,14),
(8,'Texturas Diversas 2','Efeitos','Pintura','Pintura 3D Complexa com tinta (Lisa, sem gesso) m²','até 3 metros altura','m2',116.36,87.24,145.48,15),
(8,'Texturas Diversas 2','Efeitos','Placa Gesso 3D','Somente pintura (m²)','até 3 metros altura','m2',72.68,58.12,87.24,16),
(8,'Texturas Diversas 2','Efeitos','Placa Gesso 3D','Tratamento + Pintura Fosco (m²)','até 3 metros altura','m2',116.42,101.80,131.05,17),
(8,'Texturas Diversas 2','Efeitos','Placa Gesso 3D','Tratamento + Pintura com brilho (m²)','até 3 metros altura','m2',145.48,131.05,159.92,18),
(8,'Texturas Diversas 2','Efeitos','Placa Gesso 3D','Aplicação placa + Tratamento + Pintura (m²)','até 3 metros altura','m2',196.39,174.61,218.17,19),
(8,'Texturas Diversas 2','Efeitos','Placa Gesso 3D','Venda e aplicação placa + Tratamento + Pintura (m²)','até 3 metros altura','m2',320.15,262.09,378.21,20)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 9 — Esmaltes / Verniz / Epóxi ────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Sintético','Metal e Madeira Lisa 2 demãos (m²)','até 3 metros altura','m2',21.78,16.02,27.54,1),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Sintético','Metal e Madeira Lisa 2 demãos (m²)','acima 3 metros','m2',26.33,20.63,32.03,2),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Sintético','Metal e Madeira Detalhada 3 demãos (m²)','até 3 metros altura','m2',28.70,22.20,35.19,3),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Sintético','Metal e Madeira Detalhada 3 demãos (m²)','acima 3 metros','m2',32.28,25.97,38.59,4),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Sintético','Metal Telhas Galvanizadas - 2 demãos (m²)','até 3 metros altura','m2',21.78,16.02,27.54,5),
(9,'Esmaltes / Verniz / Epóxi','Fundo','Sintético','Metal Zarcão - Primer em geral (m²)','até 3 metros altura','m2',13.89,11.65,16.14,6),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Sintético','Madeiras 2 demãos (m²)','até 3 metros altura','m2',20.26,15.77,24.75,7),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Sintético','Madeiras 3 demãos (m²)','até 3 metros altura','m2',23.24,18.93,27.54,8),
(9,'Esmaltes / Verniz / Epóxi','Fundo','Sintético','Madeiras Fundo Nivelador, Fundo Branco (m²)','até 3 metros altura','m2',16.87,13.23,20.51,9),
(9,'Esmaltes / Verniz / Epóxi','Verniz','Comum','Verniz Marítimo, Filtro Solar, Copal (Rígido) m²','Fundo + Tinta','m2',36.34,26.09,46.59,10),
(9,'Esmaltes / Verniz / Epóxi','Verniz','Super Premium','Cetol, Solgard, Verniz Alta Performance (Fléxivel) m²','Fundo + Tinta','m2',41.38,30.58,52.18,11),
(9,'Esmaltes / Verniz / Epóxi','Stain','Impregnante','Impregnante de Madeira (m²)','Uso direto','m2',29.12,20.38,37.86,12),
(9,'Esmaltes / Verniz / Epóxi','Seladora','Madeira','Proteção Simples para obras (m²)','Fundo Madeira','m2',24.81,17.47,32.15,13),
(9,'Esmaltes / Verniz / Epóxi','Azulejo','Epóxi','Pintura Azulejo (m²)','Pintura','m2',42.89,32.03,53.75,14),
(9,'Esmaltes / Verniz / Epóxi','Azulejo','Massa','Nivelamento do Azulejo (m²)','Massa','m2',39.37,29.12,49.63,15),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Epóxi','Base Solvente 3 demãos (m²)','até 3 metros altura','m2',27.67,21.72,33.61,16),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Epóxi','Base Solvente 3 demãos (m²)','acima 3 metros','m2',34.10,24.63,43.56,17),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Epóxi','Base Água 3 demãos (m²)','até 3 metros altura','m2',20.99,16.02,25.97,18),
(9,'Esmaltes / Verniz / Epóxi','Esmalte','Epóxi','Base Água 3 demãos (m²)','acima 3 metros','m2',24.81,18.93,30.70,19)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 10 — Treliças / Vigas U ──────────────────────────────────────
-- A descrição impressa termina em "(m²)" mas a coluna Observação diz
-- "Peça / Unidade" nas 12 linhas — e as folhas 11/12, do mesmo tipo de
-- serviço, cobram por peça. O texto fica verbatim; `unidade` segue a
-- coluna de cobrança ('unidade'), que é a que a tela usa.
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Vigas em U Pequena - na altura do chão / sem instalar (m²)','Peça / Unidade','unidade',20.78,15.73,25.84,1),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Vigas em U Média - na altura do chão / sem instalar (m²)','Peça / Unidade','unidade',23.03,17.98,28.09,2),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Vigas em U Grande - na altura do chão / sem instalar (m²)','Peça / Unidade','unidade',25.28,20.22,30.33,3),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Vigas em U Pequena - no alto / já instalada (m²)','Peça / Unidade','unidade',24.16,19.10,29.21,4),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Vigas em U Média - no alto / já instalada (m²)','Peça / Unidade','unidade',26.40,21.35,31.46,5),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Vigas em U Grande - no alto / já instalada (m²)','Peça / Unidade','unidade',28.65,23.59,33.71,6),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Treliças Pequena - na altura do chão / sem instalar (m²)','Peça / Unidade','unidade',20.78,15.73,25.84,7),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Treliças Média - na altura do chão / sem instalar (m²)','Peça / Unidade','unidade',23.03,17.98,28.09,8),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Treliças Grande - na altura do chão / sem instalar (m²)','Peça / Unidade','unidade',25.28,20.22,30.33,9),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Treliças Pequena - no alto / já instalada (m²)','Peça / Unidade','unidade',24.16,19.10,29.21,10),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Treliças Média - no alto / já instalada (m²)','Peça / Unidade','unidade',26.40,21.35,31.46,11),
(10,'Treliças / Vigas U','Esmalte ou Fundo','Sintético Imobiliário','Treliças Grande - no alto / já instalada (m²)','Peça / Unidade','unidade',28.65,23.59,33.71,12)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 11 — Madeira e Metal · Imobiliário (Manutenção Leve) ─────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Janelas e Venezianas - nova / repintura','Peça / Unidade','unidade',225.45,167.08,283.81,1),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Janela e Venezianas - com grades','Peça / Unidade','unidade',312.57,239.89,385.25,2),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Janela e Venezianas - restauração','Peça / Unidade','unidade',400.05,283.81,516.29,3),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Porta Lisa - boa condição','Peça / Unidade','unidade',188.98,138.20,239.76,4),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Porta Lisa - restauração','Peça / Unidade','unidade',283.69,196.57,370.81,5),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Porta de Madeira detalhada - boas condições','Peça / Unidade','unidade',250.99,196.57,305.41,6),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Porta de Madeira detalhada - restauração','Peça / Unidade','unidade',403.69,283.81,523.57,7),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Pequeno - portão novo já com primer (fundo) - somente pintura','Peça / Unidade','unidade',231.76,196.57,266.94,8),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Pequeno - repintura simples - lixar remover brilho + pintura','Peça / Unidade','unidade',285.14,242.68,327.61,9),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Pequeno - portão novo sem primer - primer (fundo) + pintura','Peça / Unidade','unidade',364.01,303.35,424.68,10),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Pequeno - restauração - massa + primer (fundo) + pintura','Peça / Unidade','unidade',606.69,485.35,728.03,11),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Grande - portão novo já com primer (fundo) - somente pintura','Peça / Unidade','unidade',424.68,364.01,485.35,12),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Grande - repintura simples - lixar remover brilho + pintura','Peça / Unidade','unidade',485.35,424.68,546.02,13),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Grande - portão novo sem primer - primer (fundo) + pintura','Peça / Unidade','unidade',788.70,728.03,849.37,14),
(11,'Madeira e Metal · Imobiliário','Esmalte','Sintético Imobiliário','Portão Grande - restauração - massa + primer (fundo) + pintura','Peça / Unidade','unidade',970.70,849.37,1092.04,15)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 12 — Madeira e Metal · Automotivo e Moveleiro ────────────────
-- Duas descrições terminam em "+" no impresso (a coluna cortou o texto).
-- Ficam como estão: completar por dedução seria inventar o que a ABRAPP
-- não escreveu.
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Pequeno - portão novo já com primer (fundo) - somente pintura','Peça / Unidade','unidade',474.43,439.24,509.62,1),
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Pequeno - repintura simples - lixar remover brilho + pintura','Peça / Unidade','unidade',527.82,485.35,570.29,2),
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Pequeno - portão novo sem primer - primer (fundo) + pintura','Peça / Unidade','unidade',606.69,546.02,667.36,3),
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Pequeno - restauração - remoção + massa + primer (fundo) +','Peça / Unidade','unidade',849.37,728.03,970.70,4),
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Grande - portão novo já com primer (fundo) - somente pintura','Peça / Unidade','unidade',667.36,606.69,728.03,5),
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Grande - repintura simples - lixar remover brilho + pintura','Peça / Unidade','unidade',728.03,667.36,788.70,6),
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Grande - portão novo sem primer - primer (fundo) + pintura','Peça / Unidade','unidade',970.70,970.70,970.70,7),
(12,'Madeira e Metal · Automotivo e Moveleiro','Esmalte','Sintético Automotivo','Portão Grande - restauração - remoção + massa + primer (fundo) +','Peça / Unidade','unidade',1213.38,1092.04,1334.72,8),
(12,'Madeira e Metal · Automotivo e Moveleiro','Poliuretano','Laqueação (moveleira/automotiva)','Portas Simples PU (Poliuretano)','Peça / Unidade','unidade',836.44,625.50,1047.39,9),
(12,'Madeira e Metal · Automotivo e Moveleiro','Poliuretano','Laqueação (moveleira/automotiva)','Portas Dupla PU (Poliuretano)','Peça / Unidade','unidade',1192.75,785.54,1599.96,10),
(12,'Madeira e Metal · Automotivo e Moveleiro','Poliuretano','Laqueação (moveleira/automotiva)','Janelas Simples PU (Poliuretano)','Peça / Unidade','unidade',829.10,538.26,1119.95,11),
(12,'Madeira e Metal · Automotivo e Moveleiro','Poliuretano','Laqueação (moveleira/automotiva)','Janelas Dupla PU (Poliuretano)','Peça / Unidade','unidade',945.65,698.54,1192.75,12),
(12,'Madeira e Metal · Automotivo e Moveleiro','Duco','Laqueação (moveleira/automotiva)','Portas Simples Laca Nitrocelulose (Duco)','Peça / Unidade','unidade',805.02,708.25,901.78,13),
(12,'Madeira e Metal · Automotivo e Moveleiro','Duco','Laqueação (moveleira/automotiva)','Portas Dupla Laca Nitrocelulose (Duco)','Peça / Unidade','unidade',1163.87,974.95,1352.80,14),
(12,'Madeira e Metal · Automotivo e Moveleiro','Duco','Laqueação (moveleira/automotiva)','Janelas Simples Laca Nitrocelulose (Duco)','Peça / Unidade','unidade',678.83,552.94,804.71,15),
(12,'Madeira e Metal · Automotivo e Moveleiro','Duco','Laqueação (moveleira/automotiva)','Janelas Dupla Laca Nitrocelulose (Duco)','Peça / Unidade','unidade',1059.58,780.93,1338.24,16),
(12,'Madeira e Metal · Automotivo e Moveleiro','Adicionais','Incluir no preço final','Descascar / Remover tinta e textura antiga (m²)','até 3 metros altura','m2',6.80,6.43,8.86,17),
(12,'Madeira e Metal · Automotivo e Moveleiro','Adicionais','Incluir no preço final','Remoção de pintura com Lixamento (m²)','até 3 metros altura','m2',8.10,7.77,10.44,18),
(12,'Madeira e Metal · Automotivo e Moveleiro','Adicionais','Incluir no preço final','Remoção de pintura com produto químico (m²)','até 3 metros altura','m2',9.23,9.10,11.65,19),
(12,'Madeira e Metal · Automotivo e Moveleiro','Adicionais','Incluir no preço final','Aplicar camada adicional de verniz','Peça / Unidade','unidade',20.20,14.44,25.97,20)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 13 — Pintura Piso e Demarcação ───────────────────────────────
-- A linha "Tinta Epóxi (Alta espessura) - Manutenção Pesada" está R$ 0,00
-- nas três faixas no impresso (buraco da tabela, não preço). Gravada como
-- 0 mesmo — a tela mostra "sem valor publicado" em vez de "R$ 0,00".
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Tubulações (Água e Gás) metro linear','metro linear','metro_linear',12.38,7.28,17.47,1),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Vaga de Garagem (Metro linear)','metro linear','metro_linear',12.98,7.77,18.20,2),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Vagas de Moto','unidade','unidade',128.19,116.36,140.02,3),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Carga e Descarga','unidade','unidade',147.37,116.48,178.25,4),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Linha de Cruzamento','unidade','unidade',248.99,209.67,288.30,5),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Linha Tracejada','metro linear','metro_linear',8.13,6.31,9.95,6),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Pintura de roda pé (Metro linear)','metro linear','metro_linear',12.38,7.28,17.47,7),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Pintura de meio fio (Metro linear)','metro linear','metro_linear',12.38,7.28,17.47,8),
(13,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Faixa de demarcação de parede estacionamento (metro linear)','metro linear','metro_linear',12.38,7.28,17.47,9),
(13,'Pintura Piso e Demarcação','Pintura Piso Estacionamento e Quadras Póliesportivas','Tinta Acrílica','Pintura de Piso Liso (Pintura simples) 2 Demãos (m²)','somente Pintura','m2',17.47,12.86,22.08,10),
(13,'Pintura Piso e Demarcação','Pintura Piso Estacionamento e Quadras Póliesportivas','Tinta Acrílica','Pintura de Piso Liso (Pintura completa) 3 Demãos (m²)','somente Pintura','m2',28.39,17.47,39.31,11),
(13,'Pintura Piso e Demarcação','Pintura Piso Estacionamento e Quadras Póliesportivas','Tinta Acrílica','Pintura de Piso Antiderrapante (Pintura completa) 3 Demãos (m²)','somente Pintura','m2',35.00,20.00,50.00,12),
(13,'Pintura Piso e Demarcação','Pintura Piso Estacionamento e Quadras Póliesportivas','Faixas','Pintura Faixas Quadras (metro linear)','metro linear','metro_linear',12.38,7.28,17.47,13),
(13,'Pintura Piso e Demarcação','Pintura Piso Estacionamento e Quadras Póliesportivas','Esmalte Epóxi','Tinta Epóxi (Comum /Baixa espessura) m² - Manutenção Leve','somente Pintura','m2',67.65,46.59,88.70,14),
(13,'Pintura Piso e Demarcação','Pintura Piso Estacionamento e Quadras Póliesportivas','Esmalte Epóxi','Tinta Epóxi (Alta espessura) m² - Manutenção Pesada','somente Pintura','m2',0.00,0.00,0.00,15),
(13,'Pintura Piso e Demarcação','Pintura Piso Estacionamento e Quadras Póliesportivas','Correção','Massa Epóxi / Cimento / Massa Acrílica (m²)','correção','m2',29.49,24.02,34.95,16)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 14 — Pintura Piso e Demarcação (continuação) ─────────────────
-- Mesma `category` da folha 13 de propósito: no impresso são duas páginas
-- do MESMO assunto, e a tela agrupa por category (senão o filtro teria
-- duas entradas com o mesmo nome).
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Sinalização Vertical em placa de aço galvanizada','unidade','unidade',89.79,68.19,111.39,1),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Vagas de Ambulância','unidade','unidade',159.98,101.80,218.17,2),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Faixa de Pedestre (até 3 metros)','unidade','unidade',128.19,116.36,140.02,3),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Cadeirante','unidade','unidade',115.70,87.24,144.15,4),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Deficiente ou Idoso','unidade','unidade',106.66,87.24,126.07,5),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Pare','unidade','unidade',106.66,87.24,126.07,6),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Setas indicativas (até 3,50x40cm)','unidade','unidade',89.79,68.19,111.39,7),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Extintores e Hidrantes (até 1 metro)','unidade','unidade',89.79,68.19,111.39,8),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Elevadores (círculo de até 40cm)','unidade','unidade',89.79,68.19,111.39,9),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Bombeiros (círculo de até 40cm)','unidade','unidade',89.79,68.19,111.39,10),
(14,'Pintura Piso e Demarcação','Demarcação e Sinalização',NULL,'Demarcação de Circulo com números de vagas','unidade','unidade',43.50,36.40,50.60,11)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 15 — Combos Massa Corrida 1 ──────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Econômico Fosco (m²)','até 3 metros altura','m2',35.11,27.98,42.24,1),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Econômico Fosco (m²)','acima 3 metros','m2',36.68,28.87,44.49,2),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Econômico Fosco (m²)','até 3 metros altura','m2',37.19,30.00,44.38,3),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Econômico Fosco (m²)','acima 3 metros','m2',38.65,30.90,46.40,4),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Econômico Fosco (m²)','até 3 metros altura','m2',37.36,30.22,44.49,5),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Econômico Fosco (m²)','acima 3 metros','m2',38.93,31.12,46.74,6),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Econômico Fosco (m²)','até 3 metros altura','m2',39.43,32.24,46.63,7),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Econômico Fosco (m²)','acima 3 metros','m2',46.51,44.38,48.65,8),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Standard Fosco (m²)','até 3 metros altura','m2',37.36,30.22,44.49,9),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Standard Fosco (m²)','acima 3 metros','m2',39.38,32.02,46.74,10),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Standard Fosco (m²)','até 3 metros altura','m2',40.61,32.92,48.31,11),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Standard Fosco (m²)','acima 3 metros','m2',40.73,33.71,47.75,12),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Standard Fosco (m²)','até 3 metros altura','m2',39.60,32.47,46.74,13),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Standard Fosco (m²)','acima 3 metros','m2',41.63,34.27,48.98,14),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Standard Fosco (m²)','até 3 metros altura','m2',42.58,35.17,50.00,15),
(15,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Standard Fosco (m²)','acima 3 metros','m2',43.42,35.95,50.89,16)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 16 — Combos Massa Corrida 2 ──────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Premium Fosco (m²)','até 3 metros altura','m2',39.60,32.47,46.74,1),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Premium Fosco (m²)','acima 3 metros','m2',41.06,33.37,48.76,2),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Premium Fosco (m²)','até 3 metros altura','m2',43.99,35.50,52.47,3),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Premium Fosco (m²)','acima 3 metros','m2',45.73,36.74,54.71,4),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Premium Fosco (m²)','até 3 metros altura','m2',41.85,34.72,48.98,5),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Premium Fosco (m²)','acima 3 metros','m2',43.31,35.61,51.01,6),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Premium Fosco (m²)','até 3 metros altura','m2',46.20,37.75,54.66,7),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Premium Fosco (m²)','acima 3 metros','m2',47.97,38.99,56.96,8),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Premium Acetinado (m²)','até 3 metros altura','m2',42.83,34.82,50.84,9),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Premium Acetinado (m²)','acima 3 metros','m2',44.72,36.63,52.80,10),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Premium Acetinado (m²)','até 3 metros altura','m2',46.40,38.20,54.60,11),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Premium Acetinado (m²)','acima 3 metros','m2',48.87,39.88,57.86,12),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Premium Acetinado (m²)','até 3 metros altura','m2',45.05,37.08,53.03,13),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Premium Acetinado (m²)','acima 3 metros','m2',46.96,38.87,55.05,14),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Premium Acetinado (m²)','até 3 metros altura','m2',50.33,40.45,60.22,15),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Premium Acetinado (m²)','acima 3 metros','m2',49.71,42.13,57.30,16),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Premium Semi-Brilho (m²)','até 3 metros altura','m2',45.73,37.64,53.82,17),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 2 Demão Acrílico Premium Semi-Brilho (m²)','acima 3 metros','m2',48.54,39.32,57.75,18),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Premium Semi-Brilho (m²)','até 3 metros altura','m2',48.03,40.11,55.95,19),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Corrida + 3 Demão Acrílico Premium Semi-Brilho (m²)','acima 3 metros','m2',51.12,42.13,60.11,20),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Premium Semi-Brilho (m²)','até 3 metros altura','m2',47.97,39.88,56.06,21),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 2 Demão Acrílico Premium Semi-Brilho (m²)','acima 3 metros','m2',50.78,41.57,59.99,22),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Premium Semi-Brilho (m²)','até 3 metros altura','m2',50.28,42.36,58.20,23),
(16,'Combos Massa Corrida','Combos com Massa Corrida em Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Corrida + 3 Demão Acrílico Premium Semi-Brilho (m²)','acima 3 metros','m2',53.37,44.38,62.35,24)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 17 — Combos Massa Acrílica 1 ─────────────────────────────────
-- Nesta folha e na 18 o impresso lista "acima 3 metros" ANTES de
-- "até 3 metros" (invertido em relação ao resto da tabela) e a coluna se
-- chama MÉDIO, não MÉDIA. A ordem impressa é preservada.
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Standard Fosco','acima 3 metros','m2',41.09,33.24,48.94,1),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Standard Fosco','até 3 metros altura','m2',43.32,35.22,51.41,2),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Standard Fosco','acima 3 metros','m2',44.68,36.21,53.14,3),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Standard Fosco','até 3 metros altura','m2',44.80,37.08,52.52,4),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Standard Fosco','acima 3 metros','m2',43.56,35.72,51.41,5),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Standard Fosco','até 3 metros altura','m2',45.79,37.69,53.88,6),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Standard Fosco','acima 3 metros','m2',46.84,38.68,55.00,7),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Standard Fosco','até 3 metros altura','m2',47.77,39.55,55.98,8),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Premium Fosco','acima 3 metros','m2',43.56,35.72,51.41,9),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Premium Fosco','até 3 metros altura','m2',45.17,36.70,53.64,10),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Premium Fosco','acima 3 metros','m2',48.38,39.05,57.71,11),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Premium Fosco','até 3 metros altura','m2',50.30,40.41,60.19,12),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Premium Fosco','acima 3 metros','m2',46.04,38.19,53.88,13),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Premium Fosco','até 3 metros altura','m2',47.64,39.18,56.11,14),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Premium Fosco','acima 3 metros','m2',50.82,41.52,60.12,15),
(17,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Premium Fosco','até 3 metros altura','m2',52.77,42.88,62.66,16)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 18 — Combos Massa Acrílica 2 ─────────────────────────────────
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Premium Acetinado','acima 3 metros','m2',47.12,38.31,55.92,1),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Premium Acetinado','até 3 metros altura','m2',49.19,40.29,58.08,2),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Premium Acetinado','acima 3 metros','m2',51.04,42.02,60.06,3),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Premium Acetinado','até 3 metros altura','m2',53.76,43.87,63.65,4),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Premium Acetinado','acima 3 metros','m2',49.56,40.78,58.33,5),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Premium Acetinado','até 3 metros altura','m2',51.66,42.76,60.56,6),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Premium Acetinado','acima 3 metros','m2',55.37,44.49,66.24,7),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Premium Acetinado','até 3 metros altura','m2',54.69,46.34,63.03,8),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Premium Semi-Brilho','acima 3 metros','m2',50.30,41.40,59.20,9),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 2 Demão Acrílico Premium Semi-Brilho','até 3 metros altura','m2',53.39,43.25,63.52,10),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Premium Semi-Brilho','acima 3 metros','m2',52.83,44.12,61.55,11),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 2 Demão Massa Acrilica + 3 Demão Acrílico Premium Semi-Brilho','até 3 metros altura','m2',56.23,46.34,66.12,12),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Premium Semi-Brilho','acima 3 metros','m2',52.77,43.87,61.67,13),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 2 Demão Acrílico Premium Semi-Brilho','até 3 metros altura','m2',55.86,45.73,65.99,14),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Premium Semi-Brilho','acima 3 metros','m2',55.30,46.59,64.02,15),
(18,'Combos Massa Acrílica','Combos com Massa Acrílica - Alvenaria',NULL,'1 Demão Selador + 3 Demão Massa Acrilica + 3 Demão Acrílico Premium Semi-Brilho','até 3 metros altura','m2',58.70,48.82,68.59,16)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── FOLHA 19 — Drywall ─────────────────────────────────────────────────
-- ATENÇÃO: no impresso, as linhas 3/5/7 têm texto IDÊNTICO entre si (e as
-- 4/6/8 também), com preços diferentes — a coluna cortou o que as separa
-- (provavelmente o acabamento: fosco / acetinado / semi-brilho). Estão aqui
-- como impressas; a tela mostra o aviso. NÃO deduzir o que falta.
INSERT INTO public.price_table_items
  (sheet_no, category, grupo, tipo, servico, observacao, unidade, preco_medio, preco_min, preco_max, sort_order) VALUES
(19,'Drywall','Drywall',NULL,'Somente Repintura (drywall já pintado)','metro quadrado','m2',15.29,8.74,21.84,1),
(19,'Drywall','Drywall',NULL,'Lixar Emendas + 1 demão Fundo + 2 demão Tinta Acabamento Fosco','metro quadrado','m2',24.75,13.10,36.40,2),
(19,'Drywall','Drywall',NULL,'Lixar Emendas + 1 demão Fundo + Massa Corrida Emendas + 2 demão Tinta Acabamento','metro quadrado','m2',31.24,18.81,43.68,3),
(19,'Drywall','Drywall',NULL,'Lixar Emendas + 1 demão Fundo + Massa Corrida Geral + 2 demão Tinta Acabamento Fosco','metro quadrado','m2',42.23,26.21,58.24,4),
(19,'Drywall','Drywall',NULL,'Lixar Emendas + 1 demão Fundo + Massa Corrida Emendas + 2 demão Tinta Acabamento','metro quadrado','m2',37.07,26.21,47.93,5),
(19,'Drywall','Drywall',NULL,'Lixar Emendas + 1 demão Fundo + Massa Corrida Geral + 2 demão Tinta Acabamento','metro quadrado','m2',47.99,33.49,62.49,6),
(19,'Drywall','Drywall',NULL,'Lixar Emendas + 1 demão Fundo + Massa Corrida Emendas + 2 demão Tinta Acabamento','metro quadrado','m2',48.66,30.58,66.74,7),
(19,'Drywall','Drywall',NULL,'Lixar Emendas + 1 demão Fundo + Massa Corrida Geral + 2 demão Tinta Acabamento','metro quadrado','m2',48.05,37.86,58.24,8)
ON CONFLICT (edicao, sheet_no, sort_order) DO UPDATE SET
  category = EXCLUDED.category, grupo = EXCLUDED.grupo, tipo = EXCLUDED.tipo,
  servico = EXCLUDED.servico, observacao = EXCLUDED.observacao, unidade = EXCLUDED.unidade,
  preco_medio = EXCLUDED.preco_medio, preco_min = EXCLUDED.preco_min, preco_max = EXCLUDED.preco_max;

-- ── Normaliza o eixo de altura ─────────────────────────────────────────
-- Roda depois de QUALQUER bloco acima (é idempotente). A tela filtra por
-- `altura`, não pelo texto — que aparece em 3 grafias diferentes no PDF
-- ("até 3 metros altura", "acima 3 metros", "acima de 3 metros").
UPDATE public.price_table_items SET altura = CASE
  WHEN observacao ILIKE 'até 3 metros%'   THEN 'ate_3m'
  WHEN observacao ILIKE 'acima%3 metros%' THEN 'acima_3m'
  ELSE NULL
END
WHERE edicao = 'ABRAPP 2026';

-- ── Conferência (só leitura) ───────────────────────────────────────────
-- Esperado: 19 folhas, 328 itens.
--   SELECT count(*) AS itens, count(DISTINCT sheet_no) AS folhas
--     FROM public.price_table_items WHERE edicao = 'ABRAPP 2026';
--   SELECT sheet_no, category, count(*) FROM public.price_table_items
--     WHERE edicao = 'ABRAPP 2026' GROUP BY 1,2 ORDER BY 1;
