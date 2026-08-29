# Estado do projeto / convenções (não perguntar de novo)

- **Captação de leads por WhatsApp com IA (2026-08-29).** Duas etapas, as
  duas no ar; SQL Wave 46 JÁ EXECUTADA (2026-08-29).
  - **Etapa A — botão "💬 Abordar"** na lista de Leads (portal). Abre
    `AbordagemModal`: mostra categoria, sub-funil (fornece obra × precisa
    de obra, via `LEAD_PITCH`), telefone e se é celular ou fixo
    (`tipoDeLinha`); sugere produtos do catálogo por palavras no NOME
    (`LEAD_PITCH[].termos`, marcáveis + busca manual); monta o texto
    personalizado (`montarAbordagem`) e envia pelo canal da loja. Ao
    enviar, lead vira `contactado`. Ícone 📱 ao lado mantém o wa.me no
    aparelho do operador. `normalizeLeadPhone` cobre celular antigo de 8
    dígitos (ganha o nono).
  - **REGRA DA LOJA (inegociável):** mensagem e IA **NUNCA** falam preço,
    valor, desconto, condição de pagamento nem fazem orçamento — isso é
    de pessoa. Aplicada em DOIS pontos: no prompt E em trava de código
    (`clientAsksForPrice` escala antes de chamar o modelo;
    `replyLeaksPrice` barra vazamento na saída). 14 testes em
    `__tests__/services/whatsapp-ai.test.ts`.
  - **Etapa B — IA meio-termo.** `whatsapp-ai.ts` (prompt + travas +
    horário comercial de Brasília 8h-19h, sem domingo + opt-out PARE +
    modelo por env `WHATSAPP_AI_MODEL`, default gpt-4o-mini). **Teto de
    30 respostas automáticas por CONVERSA por DIA** (anti-loop/custo) —
    o "dia" é o de Brasília via `diaBrt()`, não o UTC (com `toISOString`
    cru o contador virava às 21h daqui e cortava conversa de noite). e
    `whatsapp-ai-runner.ts` (cola com o webhook; ordem: opt-out > IA
    desligada > fora do horário > teto de 12/dia > responde). Ao escalar,
    DESLIGA a IA na conversa e cria alerta. Runner é best-effort: nunca
    derruba o 200 do webhook. Chamado SÓ em mensagem `in` de texto.
  - **Wave 46** (`/migrations/2026-08-29-whatsapp-ai.sql`):
    `whatsapp_ai_state` (chave por conversa + contador diário) e
    `portal_alerts` (preco/orcamento/humano), RLS só `is_portal_admin()`.
  - **Wave 47** (`/migrations/2026-08-29-whatsapp-ai-config.sql`) — JÁ
    EXECUTADA (2026-08-29). `whatsapp_ai_config` (linha única id=1:
    `hours` '8-19'|'0-24'|'8-19 +dom', `default_on`) + `last_why`/
    `last_at` em `whatsapp_ai_state`. **NÃO usar `app_settings` pra
    config que o portal ESCREVE** — ela guarda segredo de sistema
    (`push_internal_secret`, `push_notify_url`) e a RLS recusa a escrita,
    corretamente (erro visto em produção: "new row violates row-level
    security policy for table app_settings").
  - **MENSAGEM DE AUSÊNCIA (2026-08-29, junto da Wave 48).** As duas
    saídas silenciosas do runner deixaram de ser silêncio: fora do horário
    OU com a chave desligada, o cliente recebe UMA cortesia fixa ("aqui é
    da Cali Colors, obrigado pelo contato, retornamos em breve" — texto
    fixo, não é a IA falando, então nem chega perto de preço).
    `textoAusencia` + `shouldSendAway` em `whatsapp-ai.ts` (puros,
    testados); `enviarAusencia` no runner. Travas: nada pra `opted_out`,
    1 a cada 12h por conversa (`whatsapp_ai_state.away_at`), e silêncio
    se uma PESSOA respondeu nas últimas 2h (ela está no volante). Também
    abre alerta no portal (`humano`) já marcado `followed_up_at` — a loja
    vê quem escreveu de madrugada, a varredura cobra depois ("sem resposta
    há Xh") e NÃO repete a promessa. Config: `whatsapp_ai_config.away_on`
    (chave no portal) + `away_text` (texto custom, NULL = padrão).
  - **Wave 48** (`/migrations/2026-08-29-whatsapp-followup.sql`) — **JÁ
    EXECUTADA no Supabase (2026-08-29), incluindo os complementos
    `away_on`/`away_text`/`away_at` e `last_read_at`. Cron confirmado:
    `run_whatsapp_followup()` devolveu 200 com
    `{"ok":true,"ran":true,"conversas":5}` e o `app_settings.
    whatsapp_followup_url` já está com o token real. Não pedir pra rodar
    de novo.** FOLLOW-UP AUTOMÁTICO: varredura de
    hora em hora (pg_cron → pg_net → `POST /api/whatsapp-evo/followup
    ?token=<EVOLUTION_WEBHOOK_TOKEN>`, URL guardada em `app_settings.
    whatsapp_followup_url`) que olha TODAS as conversas já existentes
    (janela de 30 dias) e faz 3 coisas: (1) alerta parado vira "⏰ sem
    resposta há Xh" — cutucão interno, qualquer hora; (2) cobra o cliente
    UMA vez ("seu pedido está na fila"), só em horário de atendimento;
    (3) reengaja quem sumiu depois que a LOJA falou por último (inclui o
    lead que nunca respondeu à abordagem), 1 toque por semana. **Nenhum
    texto automático anuncia o "responda PARE"** (decisão da loja,
    2026-08-29) — a palavra continua valendo no runner: quem responde vira
    `opted_out` e não recebe mais nada. Teto de 10
    envios por varredura. Nunca fala com quem pediu PARE (`opted_out`)
    nem com a conversa cuja chave o operador desligou na mão. Lógica pura
    em `lib/api/_services/whatsapp-followup.ts` (`planFollowups`), 25
    testes. **"Resposta de gente" = `whatsapp_messages.sent_by NOT NULL`**
    — a IA grava NULL; é o único discriminador que existe.
    - **Correção junto (importante):** `whatsapp_ai_state.enabled` era
      NOT NULL DEFAULT false, mas várias escritas criam a linha de raspão
      (`registrarDecisao`, marca de follow-up) — cada uma DESLIGAVA a IA
      naquela conversa sem ninguém pedir (invisível só porque o padrão
      global também é off). Agora **NULL = "nunca decidido" → vale o
      padrão global**; a wave faz backfill (`enabled=false` sem PARE volta
      pra NULL). Servidor (`isAiEnabledFor`) e portal (`iaLigada`) checam
      `typeof enabled === 'boolean'`. **Nunca escrever `enabled` em
      upsert que não seja a chave de propósito.**
  - Portal (v=20260829n): chave "IA ligada/desligada" por conversa +
    botão "💬 Auto-resposta ligada/desligada" (mensagem de ausência) +
    botão "🔁 Follow-up ligado/desligado" + "👀 Simular follow-up" (dryRun, mostra o
    que a varredura FARIA sem enviar) + "▶ Rodar follow-up agora" + linha com a última
    varredura (`last_sweep_at`/`last_sweep_note`) +
    botão 🕐 "Só horário comercial ⟷ Responde 24h" + faixa de alertas
    com "Abrir conversa" + botão "✨ Sugerir" (copiloto: rota
    `/api/whatsapp-evo/suggest`, ignora horário e teto porque quem pediu
    foi uma pessoa; travas de preço seguem valendo). Embaixo da chave, a
    ÚLTIMA DECISÃO da IA naquela conversa (`last_why`) — silêncio da IA
    deixa de ser caça ao fantasma. Nome do contato resolve por 3 fontes:
    usuário do app > lead > pushName do WhatsApp. **NÃO LIDAS
    (2026-08-29):** contador de mensagens recebidas na lista de conversas
    + badge total no menu lateral. Marca em
    `whatsapp_ai_state.last_read_at` (banco, não localStorage — vale em
    qualquer computador); **resposta da IA NÃO zera** — só o operador
    abrir a conversa. `loadWaBadge` no root (realtime + poll 45s + evento
    `wa-lidas-mudou`) é separado do `loadBadges` (caro e quase estático);
    por isso `loadBadges` MESCLA o state em vez de substituir. Componente
    `Ajuda`
    (o "?" ao lado dos botões, abre no hover E no clique pra funcionar em
    tablet) explica cada controle da barra — conteúdo em
    `AJUDA_WHATSAPP`; **botão novo ali = item novo nessa lista**.
  - **Próximas fases (não feitas):** classificação automática do lead
    pela IA (temperatura/resumo) e os funis de PROs e Clientes — a
    máquina foi construída pra ser reaproveitada trocando roteiro e
    público.

- **Leads: "Busca AI" REMOVIDO, importador de planilha no lugar
  (2026-08-29, portal v=20260829o).** O botão "✨ Busca AI" NÃO buscava
  nada: mandava o modelo INVENTAR empresas plausíveis (nome, telefone,
  nota, avaliações) e salvava como lead `source='ai_search'`. Telefone
  inventado em formato válido é o telefone de alguém — e com o botão
  "💬 Abordar" ao lado, viram mensagem pra estranho. A base tinha 0
  `ai_search` (os 88 originais são `captacao`), então nada a limpar.
  No lugar entrou **"📥 Importar planilha"** (`ImportarPlanilhaModal`):
  lê CSV (xlsx é ZIP+XML e exigiria biblioteca; o portal não tem
  bundler), **detecta separador `;`/`,`/tab e re-decodifica em
  windows-1252** quando o UTF-8 falha (Excel pt-BR salva ANSI e com
  ponto-e-vírgula — sem isso vem tudo numa coluna ou com acento
  quebrado), casa as colunas sozinho por nome de cabeçalho com correção
  manual, mostra prévia, deduplica pelos 8 últimos dígitos do telefone e
  grava em lotes de 200 com `source='planilha'`.
  - **Importação de 986 leads do Google Maps (2026-08-29)** —
    `/migrations/2026-08-29-import-leads-planilha.sql`, **PENDENTE de
    rodar.** Da planilha de 1000 do usuário (13 telefones repetidos + 1
    sem telefone ficaram fora). Categoria crua do Maps ("Architect",
    "Closed") traduzida pras chaves de `LEAD_PITCH`; segmento vence
    quando a categoria briga com ele; "Região" separada em cidade ×
    bairro (696 linhas traziam o TERMO DE BUSCA, tipo "arquiteto Osasco
    SP", não região); prioridade pela distância (alta = Guarulhos +
    vizinhos 422, media = metropolitana 311, baixa = interior 253).
    `LEAD_PITCH` ganhou a chave **'Engenharia'** (funil `fornece`) — 234
    leads caem nela.
  - **Cabeçalho da tabela de Leads (2026-08-29, v=20260829q):** as setas
    "↕" eram DECORATIVAS — o header era `['NOME ↕', …].map()`. Agora cada
    coluna ordena de verdade (`ThLead`/`ordenarPor`, clique inverte) e tem
    filtro próprio no "▾" (`OpcoesFiltro`): Nome e Telefone por texto,
    Cidade/Segmento/Categoria/Prioridade/Status por lista com contagem,
    Rating por nota mínima. Coluna **CIDADE** nova na tabela (o endereço
    desceu pra linha de baixo do nome). O select "Ordenar" do topo saiu
    (virou redundante) e no lugar entrou "✕ Limpar N filtros", que só
    aparece com filtro ativo. Segmento/Categoria/Status do header escrevem
    nos MESMOS states dos chips do topo — uma fonte de verdade só.
  - **PEGADINHA (2026-08-29): `leads` NÃO tinha `city` nem
    `neighborhood`.** O portal lê `l.neighborhood || l.city` em 4 lugares
    (por isso todo lead mostrava "—" embaixo do nome) e o antigo Busca AI
    também mandava as duas no INSERT — o banco recusava com 42703 e o erro
    era engolido. A migration de importação cria as duas colunas antes de
    inserir. **Conferir o schema real antes de escrever INSERT em `leads`**
    (a lista de colunas do código não bate com a tabela).

- **REGRA: TODO horário do QueroUmaCor é BRASÍLIA (2026-08-28).** App e
  portal exibem sempre `America/Sao_Paulo`, independente do fuso do
  aparelho/computador. Implementado por patch na RAIZ (não em cada
  chamada): script inline no `<head>` do `app/layout.tsx` (app) e no
  `public/portal/index.html` (portal) sobrescreve
  `Date.prototype.toLocale{Date,Time,}String` injetando
  `timeZone:'America/Sao_Paulo'` + locale `pt-BR` por default — quem
  passa `timeZone` explícito continua mandando. Cobre as ~36 chamadas
  existentes e qualquer tela futura de graça. Datas gravadas no banco
  seguem em UTC (correto); a conversão é só de exibição.

- **WhatsApp do PORTAL: Evolution API (2026-08-28) — canal ÚNICO até a
  Meta autenticar.** Evolution API self-hosted (Baileys) em Docker no
  Render FREE (`https://evolution-api-8arv.onrender.com`, Manager em
  `/manager`; dorme ~15min → 1ª request pós-sono até 50s; DB no schema
  `evolution_api` do Supabase). Instância `meu-whatsapp` conectada ao
  número SECUNDÁRIO +55 11 92072-5935 (o oficial +55 11 95976-5031 fica
  reservado pra Cloud API da Meta, que ainda NÃO autenticou). Service
  `lib/api/_services/whatsapp-evo.ts` (config + sendEvolutionText com
  timeout 55s pro cold start + jidToPhone + parseEvolutionWebhook);
  webhook `POST /api/whatsapp-evo/webhook?token=<EVOLUTION_WEBHOOK_TOKEN>`
  (Evolution não assina eventos → segredo na URL; pós-token sempre 200;
  MESSAGES_UPSERT; fromMe→'out'; grupos ignorados; grava na MESMA
  `whatsapp_messages` → aparece em /admin/whatsapp). A rota
  `/api/whatsapp/send` DESPACHA: texto → Evolution quando configurada
  (senão Meta); template → SÓ Meta (503 amigável sem ela). 4 ENVS no CF
  Pages (JÁ CONFIGURADAS em 2026-08-28, confirmadas pelo ping):
  `EVOLUTION_API_URL`,
  `EVOLUTION_API_KEY` (= AUTHENTICATION_API_KEY do Render, secret),
  `EVOLUTION_INSTANCE` (opcional, default meu-whatsapp),
  `EVOLUTION_WEBHOOK_TOKEN` (string aleatória nossa, secret). Depois do
  deploy: configurar a URL do webhook no Manager (Configurations →
  Webhook, evento MESSAGES_UPSERT). 21 testes em
  `__tests__/services/whatsapp-evo.test.ts`.
  - **CAUSA DO "502 Bad gateway" NO ENVIO (2026-08-28, fechada):** era
    número ESTRANGEIRO tratado como BR. O envio usava `normalizeBrPhone`,
    que cola '55' em qualquer coisa com 10-11 dígitos → contato dos EUA
    `16503154274` (+1 650 315-4274) virava `5516503154274`, inexistente;
    o Baileys pendurava tentando resolver o JID e o CF matava a function
    ANTES de qualquer resposta nossa (por isso o 502 cru, com o
    diagnóstico do edge todo verde). Agora o envio usa
    `normalizeWhatsAppTarget` (BR local ganha 55; **11 dígitos só é
    celular BR se o 3º for 9**; 11-15 dígitos em outro formato = DDI
    estrangeiro, passa VERBATIM). `fmtWaPhone` do portal e o "+" (nova
    conversa) seguem a mesma regra. NÃO usar `normalizeBrPhone` no
    caminho da Evolution.
  - **SQL Wave 45 (2026-08-28) — JÁ EXECUTADA no Supabase (2026-08-29).
    Não pedir pra rodar de novo.**
    (`/migrations/2026-08-28-whatsapp-realtime.sql`) Põe
    `whatsapp_messages` na publication `supabase_realtime` (+ REPLICA
    IDENTITY FULL). Sem ela a aba do portal só descobre mensagem nova no
    poll. Com ela: banco AVISA, mensagem entra em ~1s. Realtime respeita
    RLS → só `is_portal_admin()` recebe evento. A tela já está pronta
    (v=20260828m): subscribe em INSERT + poll de 60s como rede de
    segurança + `setMsgs` só troca o array quando MUDOU (matava a
    "piscada" do poll) + auto-scroll só se o operador já estava no fim +
    eco local otimista no envio.
  - **Diagnóstico**: `GET /api/whatsapp-evo/ping` (admin-only) mede
    conectividade + apikey + estado da instância a partir do edge e
    reporta as envs sem vazar segredo. O botão "🔌 Testar conexao" SAIU da
    tela em 2026-08-29 (era ferramenta do 502 do envio, já resolvido) —
    a rota continua no ar, chamar direto com token de admin se precisar.
  - **Render é PAGO desde 2026-08-29 (Starter US$7/mês) — NÃO dorme mais.**
    O plano free dormia com 15min parado e derrubava a conexão do
    WhatsApp junto (o pior efeito; a lentidão de ~50s era só o sintoma
    visível). O keep-alive por cron do GitHub
    (`.github/workflows/keepalive-evolution.yml`) foi **removido**: além
    de nunca ter disparado nenhuma execução AGENDADA, o histórico do
    outro cron `*/10` deste repo (o "Uptime monitor", 1118 runs) mostra
    o que o agendador do GitHub entrega de verdade — 12 a 36min de
    intervalo de dia e **45 a 79min de madrugada**, contra os 15min de
    sono do Render. Ou seja: não resolveria. Não recriar esse workflow.
    O pré-aquecimento do portal (`aquecerEvolution`, v=20260829b) FICA:
    agora só cobre os segundos de reinício pós-deploy do Evolution, e
    `acordarEvolution` virou fallback que praticamente nunca espera
    (TTL de 5min). Mantido também o `SEND_TIMEOUT_MS` de 25s — sem cold
    start, sobra folga.

- **Portal: alterar o PERÍODO do PRO (2026-08-29, v=20260829t).** Antes, quem
  já era PRO só tinha "Remover" — pra esticar ou encurtar o plano era
  desligar e habilitar de novo (perdendo a data atual de vista). Agora o
  `ProBadgeCell` tem um ✏️ ao lado do "até DD/MM/AAAA" que reabre o mesmo
  modal em modo edição. `askProDate(opts)` virou reutilizável
  (`title`/`desc`/`confirmLabel`/`current`/`paid`): mostra a expiração
  vigente, já vem com ela preenchida e tem atalhos **+1 mês / +3 / +6 /
  +1 ano** que somam A PARTIR da data que ainda vale (renovação empilha em
  cima do que sobrou; se já venceu, conta de hoje). Por baixo é o MESMO
  `set_pro` com `value:true` + `expiresAt` — nenhuma rota nova, nenhum SQL.
  Assinatura paga do Mercado Pago (`mp_preapproval_id`) também pode ser
  editada, mas o modal AVISA que a próxima renovação automática pode
  sobrescrever a data (o botão "Remover" segue escondido nesse caso, como
  era).

- **Portal: e-mail sumido ("—") e sem lápis — consertado (2026-08-29,
  v=20260829e).** Duas coisas diferentes apareciam como um bug só. (1)
  `profiles.email` é só um ESPELHO: quem se cadastrou por um fluxo que não
  preenchia a coluna (ou nasceu antes dela) fica com `email` NULL e o
  portal mostra "—" pra sempre — o login de verdade mora em `auth.users`,
  invisível pra chave anon do portal. Agora a action `sync_email` de
  `/api/admin/users` (service `syncEmailFromAuth`) lê o e-mail no GoTrue
  admin, devolve pro portal e ESPELHA em `profiles.email`; o botão 🔄 na
  `EmailCell` (só aparece quando o espelho está vazio) dispara isso.
  Perfil órfão sem login responde 404 com texto explicando (aí é usar o
  lápis, que cria/troca o login via `set_email`). (2) A coluna de e-mail
  só existia na aba Clientes: **Pintores** (e Grafiteiros/Funileiros, que
  reusam `PintoresList`) ganharam a coluna Email, e a lista "Usuarios com
  acesso ao Portal" trocou nome/e-mail em texto puro por `NameCell` +
  `EmailCell`. Helper novo `adminUsersData` (irmão do `adminUsers`) devolve
  o CORPO da resposta — `adminUsers` virou wrapper booleano dele.

- **SQL Wave 44 (2026-08-28) — JÁ EXECUTADA no Supabase (verificado em
  2026-08-29: `admin_delete_user(p_user_id uuid, p_force_admin boolean)`
  existe e 0 FKs public→profiles/auth.users com NO ACTION/RESTRICT).
  Não pedir pra rodar de novo.**
  (`/migrations/2026-08-28-delete-user-fk-sweep.sql`) CAUSA RAIZ do 502
  de exclusão comprovada: `quotes_painter_id_fkey` (e possivelmente
  outras FKs) referencia profiles SEM ON DELETE → conta com orçamento
  não excluía (era o que derrubava GoTrue/edge). A wave (1) varre
  dinamicamente TODAS as FKs public→profiles/auth.users com NO ACTION/
  RESTRICT e recria: coluna nullable → SET NULL, NOT NULL → CASCADE;
  (2) recria `admin_delete_user(uuid, boolean)` com `p_force_admin` —
  portal (v=20260828g) manda true após 3ª confirmação pra excluir
  conta admin/portal ("habilitar para excluir aqui tbm"); a PRÓPRIA
  conta segue sempre bloqueada. Trocar pra "JÁ EXECUTADO" após rodar.

- **Portal: editar nome, e-mail, cidade, UF e especialidades
  (2026-08-28, v=20260828h).** Células com lápis igual TagCell:
  `NameCell` (Pintores + Clientes), `EmailCell` (Clientes), `CityCell` +
  `StateCell` (Pintores + Clientes), `SpecialtiesCell` (Pintores). As
  abas Grafiteiros e Funileiros REUTILIZAM o componente `PintoresList`
  (roleFilter) — edição neles vem de graça. Actions na rota
  `/api/admin/users`: `set_name` (2-60 chars), `set_email` (PUT no
  GoTrue admin — troca o LOGIN — + espelho em profiles.email; 409 se em
  uso; critical no audit_log; perfil órfão ganha só o espelho) e
  `set_info` (city ≤60 / state UF 2 letras / specialties ≤200; string
  vazia LIMPA o campo).

- **SQL Wave 43 (2026-08-28) — JÁ EXECUTADA no Supabase (2026-08-28). Não
  pedir pra rodar de novo.**
  (`/migrations/2026-08-28-admin-delete-user-rpc.sql`) Exclusão
  permanente de conta pelo portal: a rota `/api/admin/users`
  (action delete_user) morria com a página "502 Bad Gateway" do PRÓPRIO
  Cloudflare (corpo capturado no relatório do portal comprovou) — o
  edge era derrubado durante a chamada HTTP ao GoTrue. Solução: RPC
  `admin_delete_user(uuid)` SECURITY DEFINER que roda a cascata inteira
  dentro do Postgres (guardas: is_portal_admin, nunca a própria conta,
  nunca admin/portal — colunas via to_jsonb; audit_log antes do
  delete). O portal (v=20260828f) chama a RPC direto via supabase-js;
  a rota edge segue existindo pras outras actions (set_tag/set_pro/…).

- **SQL Wave 42 (2026-08-28) — JÁ EXECUTADA no Supabase (2026-08-28,
  verificação retornou security_definer=true pras 2 RPCs). Não pedir
  pra rodar de novo.**
  (`/migrations/2026-08-28-quotes-insert-fix.sql`) Fix do "new row
  violates row-level security policy for table quotes" ao Gravar/Enviar
  orçamento: as RPCs `create_painter_draft` e `create_quote_from_post`
  só existiam no `supabase_init.sql` (nenhuma wave incremental as criou
  no banco vivo na forma SECURITY DEFINER) e as policies de INSERT
  direto em `quotes` foram derrubadas no hardening → o INSERT da função
  viva batia na RLS. A wave derruba TODAS as overloads vivas, recria as
  2 RPCs canônicas (SECURITY DEFINER + search_path), passa a gravar
  `post_id` (a versão do init recebia `p_post_id` e NÃO gravava — o
  filtro de leads comprados nunca casava) e adiciona policy de INSERT
  fallback (cliente = quote própria; pintor = só rascunho sem
  client_id).

- **SQL Waves 40 e 41 (2026-08-28) — JÁ EXECUTADAS no Supabase (2026-08-28). Não pedir pra rodar de novo.**
  - **Wave 40** (`/migrations/2026-08-28-profile-counters-triggers.sql`):
    os contadores `followers_count`/`following_count`/`posts_count` de
    `profiles` NUNCA tiveram trigger de manutenção no repo (a migration
    2026-06-14 só recriou a view assumindo que existiam) → o perfil
    mostrava "0 seguindo" com dezenas de follows reais. Cria os triggers
    (SECURITY DEFINER — sem isso a RLS barra o UPDATE no profile do OUTRO
    usuário) + BACKFILL a partir de follows/posts.
  - **Wave 41** (`/migrations/2026-08-28-exports-bucket.sql`): bucket
    `exports` (público, 10MB, só application/pdf, escrita no próprio
    path). No WebView do wrapper NENHUM download local funciona (share de
    arquivo ausente; blob: o nativo não lê; data: o DownloadManager
    recusa) — o app sobe o PDF pro bucket e entrega o LINK público com
    `?download=` (quotePdf.uploadPdfForLink). Sem o bucket, cai no
    fallback data URL (que no wrapper não salva).

- **Respostas automáticas do chat — consertadas, SQL Wave 39 JÁ EXECUTADO
  no Supabase (2026-08-28).** Dois bugs: (1) `auto_responses` nasceu SEM unique em
  `(user_id, trigger_type)` → o upsert `onConflict` do AutoRespostaSheet
  falhava com 42P10 em TODO salvamento, e o código não conferia o `error`
  do supabase-js (não lança!) → toast "salvas!" mentiroso, toggle voltava
  desligado; agora o save é 1 upsert em lote com erro conferido. (2) O
  disparo rodava no NAVEGADOR do pintor (useChatRealtime.maybeAutoReply)
  — só respondia com o app aberto; o listener foi REMOVIDO e o disparo
  virou trigger no banco. **Wave 39**
  (`/migrations/2026-08-28-auto-responses-fix.sql`): limpa duplicatas,
  cria a UNIQUE e o trigger `trg_auto_reply_on_message` (responde mesmo
  com app fechado; anti-loop pelo marcador "🤖 Resposta automática:";
  máx 1 por conversa/12h; EXCEPTION WHEN OTHERS igual Wave 36). **Wave 39 rodada em 2026-08-28 — não pedir pra rodar de
  novo.** Follow-up (3 dias) segue não implementado (precisa de
  pg_cron; só o slot new_message dispara).

- **Pull-to-refresh nativo do AAB (WebIntoApp) — neutralizado pelo lado web
  (2026-08-28).** O AAB da Play Store envolve a WebView num
  `SwipeRefreshLayout`; ele arma o reload quando `canChildScrollUp()` é
  false, e como o app é shell 100dvh + overflow hidden (só o `<main>` rola),
  o documento vivia em scrollY 0 → reload armado na tela INTEIRA (arrasto
  rápido pra baixo = círculo de recarregar, em qualquer posição). CSS/JS não
  alcançam o toque nativo, mas o ESTADO consultado sim. Defesa em 3
  camadas, em QUALQUER Android (gate largado em 2026-08-28 de "UA com
  token wv" pra "/Android/i" — o wrapper pode customizar o UA e o pin
  ficava mudo; no Chrome/PWA o pin é inofensivo e ainda mata o
  pull-to-refresh do próprio Chrome; iOS/desktop são no-op): (1) script
  inline no `<head>` do layout.tsx pina ANTES da hidratação (senão o boot
  ficava desprotegido); (2) hook `useAndroidWebViewScrollPin` (montado no
  RootLayout via `<AndroidWebViewScrollPin>`) estica o body em 4px — em
  `dvh` com fallback `vh`, senão a barra de URL do Chrome ganharia ~60px
  de scroll real — e PINA o documento em `scrollY = 2`, com re-pin em
  scroll/resize/pageshow/visibilitychange (retomada do WebView); (3)
  guarda de dreno: touchmove no document cancela arrasto descendente que
  nasce fora de qualquer scroller (TopNav, /login) — sem ela o gesto
  drenava o pin 2→0 e re-armava o reload no meio do movimento. Com o
  documento fora do topo, o nativo responde "pode subir" e o gesto nunca
  arma. **Constantes espelhadas** entre o hook e o script inline do
  layout — mudou um, mudar o outro. **Diagnóstico TEMPORÁRIO ativo**:
  1 ping/sessão de aparelho Android pro `/api/log-error`
  (`type='scrollpin-diag'`, aparece no `/admin/errors` com o UA real do
  wrapper) — REMOVER depois de confirmar que o AAB entra no gate.
  **Correção de raiz continua pendente**: desmarcar "Pull to Refresh" no
  painel do WebIntoApp no próximo rebuild do AAB (checklist do
  `docs/ANDROID_BUILD.md`). Testes em
  `__tests__/hooks/useAndroidWebViewScrollPin.test.tsx`.

- **WhatsApp Cloud API — LIVE ponta a ponta (2026-08-25).** O número
  oficial (+55 11 95976-5031) está na Cloud API da Meta (WABA
  `102067872689175`, Phone Number ID `109293361953640`, app "CaliColors
  Integracao API"). Service em `lib/api/_services/whatsapp.ts` (builders
  puros + `sendWhatsAppText/Template` + `verifyMetaSignature` +
  `parseInboundMessages`); rotas `/api/whatsapp/send` (admin-only, mesmo
  gate do `/api/admin/users`, rate limit 30/min, audit_log com preview de
  80 chars) e `/api/whatsapp/webhook` (GET verificação + POST com HMAC
  `X-Hub-Signature-256` validado antes do parse; pós-assinatura sempre 200,
  anti-retry-storm igual mp-webhook). 22 testes em
  `__tests__/services/whatsapp.test.ts`. Doc: `docs/WHATSAPP_CLOUD_API.md`.
  - **O access token NÃO está no código** (IDs públicos são default; token
    só via env). As 3 envs JÁ ESTÃO no CF Pages Production (2026-08-25):
    `WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`,
    `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Webhook JÁ CADASTRADO e verificado no
    painel da Meta (subscribe em "messages"). Não pedir pra configurar de
    novo. Se o token vazar/expirar (erro 190 do Graph): regenerar no
    painel Meta e trocar só a env + redeploy.
  - **Janela de 24h da Meta**: texto livre só pra quem escreveu nas últimas
    24h; fora dela o Graph dá 131047 e a rota responde 422 "use um template
    aprovado". Templates se criam no WhatsApp Manager.
  - **SQL Wave 38 — JÁ EXECUTADO no Supabase (2026-08-25)**
    (`/migrations/2026-08-25-whatsapp-messages.sql`):
    tabela `whatsapp_messages` (direction in/out, `message_id` UNIQUE pra
    dedupe de retry da Meta, RLS SELECT só `is_portal_admin()`, escrita só
    service_role). Webhook grava inbound e `/api/whatsapp/send` grava
    outbound via `persistWhatsAppMessage` (best-effort — falha nunca custa
    o 200 do webhook nem a mensagem enviada; sem a tabela, tudo segue
    funcionando só com log). Tela `/admin/whatsapp` (RSC guard
    `requireAdminServer` + `WhatsAppAdmin` client): lista em estilo conversa
    (poll 15s), filtros in/out, form de envio de texto livre e botão
    "Responder". NÃO misturar com a tabela `messages` do chat interno
    (user↔user, FK em profiles) — aqui o interlocutor é telefone externo.

- **WebView: "erro 500 e não abre mais" / "sem internet" — 4 causas
  corrigidas (2026-08-22).** Sintomas: no Android, sair e voltar (ou no meio
  do uso) dava 500 e o app não abria mais; no iOS, "não tem internet" ao
  tentar conectar.
  - **Cache envenenado (a causa do 500 permanente).** O `sw.js` gravava a
    resposta de NAVEGAÇÃO sem olhar o status: um 500 passageiro do Cloudflare
    virava conteúdo permanente do cache e voltava a cada falha de rede — e o
    WebView do Android SEMPRE falha por um instante ao voltar do background
    (rádio ainda subindo). Internet boa, erro vindo do disco. Agora
    `isCacheable()` (só 200, não-redirecionado, não-opaco) barra a escrita,
    `matchUsable()` nunca devolve resposta de erro guardada, e o último
    recurso é uma página "Sem conexão" gerada na hora com botão de recarregar.
    **`CACHE_VERSION` foi pra `quc-v3` — é o bump que limpa os caches já
    envenenados de quem está preso hoje** (o `activate` apaga toda chave fora
    da versão). Bumpar de novo em qualquer mudança de estratégia do SW.
    **v5 (2026-08-28): 5xx cru NUNCA mais chega na tela em navegação de
    documento.** O v4 preferia o cache mas, sem cópia boa (comum: SPA quase
    não gera navegação de documento), devolvia o 500 cru — era a tela
    "500 | Server Error" morta ao reabrir a tela do celular com o app aberto
    (renderer morto → re-navegação → soluço 5xx do edge). Agora o último
    recurso pra 5xx é a página "Reconectando…" com AUTO-RETRY (backoff
    2.5s+n·1.5s, teto 6/2min via sessionStorage, reload também no evento
    `online`) — o app volta sozinho sem matar o processo. RSC segue
    recebendo status cru (router faz hard-nav). Incidente 5xx pós-retry
    loga `type='sw-nav-5xx'` no /admin/errors (best-effort). O ping
    `scrollpin-diag` ganhou o campo `sw=` (SW controlando a página?).
  - **Sem retentativa.** Navegação agora repete UMA vez (600ms) em falha de
    rede e em 5xx. Cobre a retomada do WebView e cold start ruim do edge.
    `install` também deixou de ser all-or-nothing (`addAll` → puts tolerantes):
    um asset 404 abortava o install inteiro e o SW nunca ativava.
  - **`getSession()` sem teto = "Carregando…" eterno.** Não é só leitura de
    localStorage — com token vencido ele faz refresh pela rede, e no WebView
    esse fetch fica pendurado pra sempre quando o sistema congela a tela.
    Como `loading` só virava false no `.then`, o `AppShell` ficava travado.
    Agora corre contra `SESSION_TIMEOUT_MS` (8s), refaz a leitura em
    `visibilitychange`/`online`/`pageshow`, e o `/login` redireciona sozinho
    se a sessão chegar depois. **Qualquer await de rede no caminho de boot
    precisa de timeout — no WebView promessa pendurada não rejeita.**
  - **iOS: App-Bound Domains sem o Supabase.** `WKAppBoundDomains` +
    `limitsNavigationsToAppBoundDomains: true` fazem a WKWebView SÓ enxergar
    os domínios da lista, que tinha só `queroumacor.com.br`. Requisição
    bloqueada chega no JS como falha de rede genérica → `errors-friendly.ts`
    traduz pra "Sem conexão. Verifique sua internet". Supabase adicionado ao
    plist e ao `allowNavigation`. Limite da Apple: 10 domínios.
  - **Pendências conhecidas (não corrigidas aqui):** (1) `webDir` aponta pra
    `next-app/.next/static`, que NÃO é web build (sem `index.html`) — não
    existe bundle local de fallback, então sem rede na abertura o app não tem
    uma tela sequer pra mostrar; (2) login Google/Apple navega a própria
    WebView pro provedor — o Google recusa OAuth em WebView embarcada
    (`disallowed_useragent`) e o App-Bound Domains do iOS bloqueia a
    navegação; o certo é `@capacitor/browser` + deep link de callback.
  - Testes em `next-app/__tests__/sw.test.ts` (11): carregam o `sw.js` num
    escopo falso e travam a regra "erro nunca entra nem sai do cache".

- **Logos do app aparecem no /portal (Camisetas) — 2026-08-22.** Antes, o que
  o pintor gerava com o Seu Zé ("Gerar Logo") era uma **data URL base64** de
  ~1.5MB que só existia no state da tela; as 2 variantes não escolhidas
  sumiam e a loja não tinha como saber qual arte estampar. Agora
  `/api/generate-logo` materializa cada imagem no bucket `posts`
  (`<userId>/logos/<uuid>.png`, via service_role) e grava uma linha em
  `brand_logos` com dono + prompt. O upload "Já tenho meu logo" faz o mesmo
  pelo cliente (`lib/services/brandLogos.ts`) e o path deixou de ser fixo
  (`business_logo.<ext>` com upsert apagava o arquivo antigo e invalidava o
  histórico).
  - **Persistir é best-effort**: se o storage/insert falhar, a rota devolve as
    data URLs da IA como antes — nunca custar ao pintor o logo recém-gerado.
  - `/portal` → "Camisetas Personalizadas" ganhou a galeria "Logos dos
    pintores": foto + nome/@tag/telefone/cidade + prompt + badge IA/Enviado +
    "★ logo atual" (comparando com `profiles.business_logo_url`), busca,
    filtro por fonte, "Usar na camiseta" (entra no mockup e no Gerar Pedido)
    e atalho de WhatsApp. Query em 2 passos (sem embed PostgREST), igual
    Pedidos da Loja.
  - No app, a tela Camisetas ganhou "🗂️ Meus logos" — o mesmo histórico,
    tocar aplica o logo no perfil.
  - **SQL Wave 37 — JÁ EXECUTADO no Supabase (2026-08-22)**:
    `/migrations/2026-08-22-brand-logos.sql`. Cria `brand_logos` (RLS
    owner + `is_portal_admin()` pra SELECT), índice único
    `(user_id, md5(image_url))` pra retry não duplicar, backfill do
    `business_logo_url` atual e **recria `cleanup_orphan_media()`** — a
    versão da Wave 5 considerava órfão TODO arquivo do bucket `posts` sem
    post, o que incluía os logos.

- **Push com o app fechado — TUDO codado, NADA ligado (2026-08-22).** Service
  worker (`public/sw.js`, handlers `push` + `notificationclick`), rota
  `/api/push-notify` e o componente `PushOptIn` já existem. O que falta é
  configuração, em 4 passos: (1) gerar VAPID (`npx web-push
  generate-vapid-keys`); (2) 4 envs no CF Pages Production —
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (**plain text**, é lida no build),
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_INTERNAL_SECRET` — e refazer o
  deploy; (3) rodar `/migrations/2026-06-11-push-subscriptions.sql` +
  os 2 inserts em `app_settings` (`push_notify_url`, `push_internal_secret`,
  este igual ao do CF); (4) cada aparelho toca "Ativar notificações" no
  perfil. **Sem a env pública o `PushOptIn` retorna null** — é por isso que a
  opção "não aparece" no celular.
  - **SQL Wave 36 — JÁ EXECUTADA (verificado em 2026-08-29: trigger
    `trg_notify_on_message` existe e `notif_actor_label` também).** O gatilho de push escuta `notifications`, e
    só `likes`/`comments` criavam linha lá: **mensagem de chat não gerava
    notificação nenhuma**, então nunca viraria push. Migration em
    `/migrations/2026-08-22-notify-on-message.sql` cria
    `trg_notify_on_message` (agrupa rajada: pula se já há aviso não lido do
    mesmo remetente nos últimos 5 min; `EXCEPTION WHEN OTHERS` pra falha em
    notificar nunca derrubar o INSERT da mensagem) e recria
    `dispatch_push_on_notification` mandando `type='message'` pro `/chat`.
  - iOS: só 16.4+ e **só em modo PWA** (Adicionar à Tela de Início).
  - **WebView não tem Web Push — nem iOS nem Android (2026-08-22).** O app
    empacotado (Capacitor) roda em WebView, então TODO o caminho web push
    acima só vale pra quem usa pelo navegador/PWA. O `PushOptIn` agora
    **some** quando o ambiente não suporta, em vez de mostrar "instale como
    app na tela inicial" — dica sem sentido pra quem já está num app
    instalado. Push no app das lojas exige push NATIVO (plugin
    `@capacitor/push-notifications` + FCM/APNs, tabela de tokens e envio via
    FCM no servidor); vai junto do próximo build nativo. Backend web push
    validado ponta a ponta em 2026-08-22: `{"ok":true,"sent":0,"total":0}`
    (200, sem inscritos).
- **Edge do Cloudflare: secret NÃO chega em `process.env` (2026-08-22).**
  Descoberto depurando o portal admin em produção. As variáveis do painel do
  Pages só existem no request context, publicado no symbol global
  `Symbol.for('__cloudflare-request-context__')`. **Ler sempre por
  `getRuntimeEnv()` (`lib/api/env.ts`), nunca `process.env` direto**, pra
  qualquer secret/config de runtime — ele tenta o symbol e cai pro
  `process.env` (build, dev, vitest).
  - `env.ts` NÃO pode importar `@cloudflare/next-on-pages`: o entrypoint faz
    `require('server-only')`, pacote não instalado, e isso derruba a CARGA de
    ~40 arquivos de teste ("Cannot find module 'server-only'" → 197 testes a
    mais quebrados). Lemos o symbol na mão.
  - Corolário que causou o 403 do portal: nada que dependa de env pode ser
    lido no MODULE-LOAD — no boot não existe request, logo não existe env.
    `admin-config.ts` parseava `ADMIN_EMAILS` no boot e o cache nascia
    sempre vazio → `isAdminEmail()` sempre false → "não autorizado (email
    não admin)". Virou preguiçoso (parse na 1ª chamada).
  - Baseline da suíte: **11 falhas / 1079 testes** (mocks de supabase +
    matchers de categoria, pré-existentes). Se passar disso, algo do edge
    voltou a quebrar a carga dos testes.
- **Chat 3-way (cliente + pintor + loja) — 2026-08-22.** Não existe tabela de
  conversas: tudo é `messages` com `conversation_id` texto (`uuidA_uuidB`
  ordenado no 1:1, prefixo `3way:` quando criado por essa via,
  `store_calicolors_<uuid>` na conversa direta com a loja). A loja entra pelo
  banner dentro da conversa (só profissional vê — `isPainter` no
  `ChatConversation`), que insere `__STORE_ADDED__` (type=system, marcador) +
  saudação (type=store). O `/portal` → "Chats 3-Way" lista agrupando por
  `conversation_id` e responde com type=store.
  - **Fix 1 — a tela não percebia a loja.** `is3way` olhava só o prefixo do
    convId, mas adicionar a loja NÃO troca o convId. Resultado: cabeçalho
    nunca virava "+ Cali Colors" e o convite continuava na tela (dava pra
    adicionar de novo e duplicar a saudação). Agora deriva de 3 sinais:
    prefixo, `convMeta.is3way` (marcador) ou qualquer mensagem `type='store'`
    já carregada. `findOrCreate3WayWithStore` segue sem caller (código morto).
  - **Fix 2 — atalho "🎨 Loja" na lista de conversas** (`ChatList`), que abre
    ou cria a conversa direta com a loja. Antes só existia a ABA "Cali
    Colors", que FILTRA conversas existentes — quem nunca tinha falado com a
    loja precisava adivinhar o nome dela na busca do "+".
  - **SQL Wave 35 — JÁ EXECUTADA no Supabase (2026-08-29).** A policy de SELECT em `messages`
    liberava só sender/receiver, e a loja responde escolhendo UM destinatário
    → o terceiro não via a mensagem. A policy nova acrescenta participante
    ESTRUTURAL: `POSITION(auth.uid()::text IN conversation_id) > 0`. **Não usar
    a regra "tem mensagem sua nessa conversa"** — o convId é derivado de UUIDs
    públicos, então qualquer um poderia inserir uma mensagem na conversa
    alheia e passar a ler o histórico. Migration em
    `/migrations/2026-08-22-messages-conversation-visibility.sql`.
- **Corte de tela no iPhone — 4 causas corrigidas (2026-08-21).**
  - **Zoom automático do iOS**: campo com `font-size < 16px` faz o Safari
    ampliar ao focar; o viewport de layout fica maior que a tela e o
    conteúdo "corta" (bolha de chat sumindo pela direita, campo de digitar
    fora de vista). Regra no fim do `globals.css`, escopada em
    `@media (pointer: coarse)`, força 16px em input/textarea/select
    (checkbox/radio/range de fora). Desktop mantém `text-sm`. **Não usar
    `maximum-scale=1` no meta viewport** — iOS moderno ignora e mataria o
    pinch-zoom de acessibilidade.
  - **`100vh` no `AppShell`**: no Safari do iPhone o `vh` conta a área atrás
    das barras do navegador, então BottomNav/composer nasciam abaixo da
    dobra. Virou `height: 100dvh` inline (classe `h-screen` fica de
    fallback). **Preferir `dvh` em qualquer altura de tela cheia daqui pra
    frente.**
  - **Personas de IA** (Alice/Seu Zé/Fê/Senna): `height: min(70vh, 600px)`
    virou `min(70dvh, 600px)` + `maxHeight: 100%` — sem o teto, o painel
    estourava o espaço do bottom-sheet e empurrava o campo de digitar pra
    fora. Modal de histórico: `calc(100vh - 80px)` → `100dvh`.
  - **`min-h-screen` dentro do AppShell** (19 pages): forçava 100vh de
    altura dentro de um `<main>` que já é menor que isso (TopNav +
    BottomNav), criando scroll fantasma e jogando o fim do conteúdo sob a
    barra. Virou `min-h-full`. Páginas `/admin/*` (fora do AppShell)
    seguem com `min-h-screen`, corretamente.
- **Tour guiado da 1ª abertura (coach marks) — 2026-08-21.** `components/
  AppTour.tsx` escurece a tela, abre um "buraco" de luz em cima de um botão
  real da navegação e mostra um balão explicando pra que ele serve (tom
  simples, PT-BR). Tocar em qualquer lugar (ou no balão / "Próximo") avança;
  "Sair do tutorial" e `Esc` fecham. Roteiro em `lib/tour/steps.ts` (9 passos:
  boas-vindas → Início → Mensagens → Buscar → Loja → Avisos → Perfil → Plano
  → fim), geometria pura testável em `lib/tour/position.ts`, flag
  `app_tour_seen_v1` em `lib/tour/storage.ts`.
  - Os alvos são marcados com `data-tour="nav-*"` no `BottomNav` (feed/
    search/loja/notif/perfil) e no `TopNav` (chat/plano). **Se mexer nesses
    componentes, preservar os `data-tour`** — sem eles o passo é pulado.
  - Montado no `AppShell` (precisa de TopNav+BottomNav na tela pra medir).
    Auto-abre SÓ em `/feed`, SÓ logado e SÓ uma vez por dispositivo. Passos
    cujo alvo não existe são pulados automaticamente.
  - O holofote é `box-shadow: 0 0 0 9999px preto` numa div vazia; animar
    top/left/width/height faz a luz "voar" entre os botões. Keyframes
    (`.tour-ring`, `.tour-balloon-in/-fade`) no fim do `globals.css`.
    Respeita `prefers-reduced-motion`.
  - Rever depois: botão "Ver tutorial de novo" no `ProfileFooter` (chama
    `startTour()`), roda ali mesmo no `/perfil`.
  - `components/OnboardingModal.tsx` + `lib/hooks/useOnboarding.ts` foram
    **deletados** — eram um modal de 5 passos que nunca chegou a ser
    renderizado em lugar nenhum, e virou duplicata deste tour.
  - `vitest.config.ts` ganhou `plugins: [react()]` pra rodar testes de
    componente (`.test.tsx`, com `// @vitest-environment jsdom`).
- **Tour 2 — ferramentas do Perfil (1 passo por tile) — 2026-08-21.** Mesmo
  `<AppTour>`, agora parametrizado por props (`tour` / `steps` / `autoPath`).
  Roteiro `PROFILE_TOUR_STEPS` em `lib/tour/steps.ts`: boas-vindas + um passo
  explicando CADA quadradinho do `BusinessGrid` (AR Grafite, Arte pra venda,
  Avaliar, Pedidos, Orçamento, Orçamentos, Pontos, Portfolio, Calculadora,
  Agenda, Reativar clientes, Financeiro, Anotações, Arte pra IG, Camisetas,
  Formação, Seu Zé, Alice, Fê, Senna) + fim.
  - Alvos: `data-tour={`tile-${tile.sheet}`}` no botão do `BusinessCard` —
    derivado da chave `sheet`, então **tile novo no grid = passo novo no
    steps.ts** (o teste `__tests__/tour.test.ts` lê o fonte do BusinessGrid
    e QUEBRA se faltar/sobrar passo; é de propósito).
  - Como os tiles são condicionais ao papel, cada usuário só vê os passos
    das ferramentas que tem — pintor não vê AR Grafite, cliente não vê
    Financeiro, cada papel vê só a sua persona de IA. Quem filtra é o
    `resolveVisibleSteps` (alvo ausente = passo pulado).
  - Montado dentro do `BusinessGrid` (não no AppShell) porque é lá que os
    alvos existem. Auto-abre em `/perfil`, flag própria
    `profile_tour_seen_v1` — independente da flag do tour de navegação.
  - Rever depois: botão "Ver tutorial das ferramentas" no `ProfileFooter`
    (`startTour('profile')`). O evento de start virou `CustomEvent` com
    `detail.tour`, então cada instância do AppTour só responde ao seu.
  - Dois detalhes que o tour comprido exigiu: (1) o passo dá
    `scrollIntoView({block:'center'})` no tile fora da dobra — por isso o
    lock de scroll deixou de ser `overflow:hidden` no body (que mataria o
    scroll programático) e virou `preventDefault` em touchmove/wheel;
    (2) acima de 10 passos as bolinhas de progresso viram barra + "3 de 21".
- **Composer: venda só pra profissional + story sem legenda IA — 2026-08-21.**
  `canMarkPostForSale` em `lib/policies.ts` (nega `role='cliente'`, libera o
  resto inclusive role vazio, admin sempre pode) esconde o "Marcar como
  venda" do `Composer`; `CaptionInput` ganhou prop `showGenerate` e o botão
  "✨ Gerar legenda (IA)" some na aba Story (story expira em 24h e a chamada
  consome cota de IA). O payload do publish reconfere a permissão em vez de
  confiar no state — o `forSale` sobrevivia a troca de aba/autosave/deep-link
  `?forSale=1` e vazava `for_sale=true` pra story.
  - **SQL Wave 34 (2026-08-21) — D1 FECHADO, JÁ EXECUTADO no Supabase.** A
    regra também vive no banco: trigger `trg_enforce_post_for_sale_role`
    (BEFORE INSERT OR UPDATE em `posts`) zera `for_sale`/`price`/`art_type`
    quando o autor tem `role='cliente'` — admin e role vazio passam, igual
    ao `canMarkPostForSale`. Os 3 posts antigos que violavam foram limpos
    (só a marcação de venda; os posts seguem no feed). Migration em
    `/migrations/2026-08-21-posts-for-sale-role-guard.sql`.
  - **Pegadinha do schema:** `profiles.is_admin` NÃO existe na tabela real,
    apesar de aparecer no código legado e em migrations antigas (a v1 desta
    migration quebrou com 42703 por causa disso). Por isso a função lê a
    linha do autor via `to_jsonb(p) ->> 'campo'`: coluna ausente vira chave
    ausente → NULL, em vez de abortar. **Usar esse padrão em qualquer SQL
    novo que toque colunas de admin do `profiles`.** Suspeita aberta: a
    função `is_portal_admin()` (usada nas policies de RLS de ~13 tabelas)
    referencia `is_admin` na migration que a criou — se estiver mesmo assim
    no banco, está quebrada em runtime. Checar com `SELECT is_portal_admin();`
- **Portal: formulário de produto virou gaveta lateral (2026-08-21).** Era
  um card no TOPO da lista — ao rolar pra achar a cor/produto, ele sumia de
  vista. Agora é `position:fixed` colado na direita (460px, altura cheia),
  com cabeçalho fixo (título + X, `Esc` fecha), corpo rolável só dos campos
  e rodapé fixo com Ativo/Cancelar/Salvar. A lista ganha `paddingRight`
  enquanto a gaveta está aberta pra nenhum card ficar embaixo dela; os grids
  do form caíram de 3-4 pra 2 colunas por causa da largura. Keyframe
  `drawerIn` no `<style>` do `index.html`.
  - **Como recompilar o portal** (o `app.js` commitado é reproduzível byte a
    byte a partir do `app.jsx`): `@babel/core` + `@babel/preset-react`
    (`runtime: 'classic'`), `generatorOpts: { jsescOption: { minimal: false } }`,
    `compact: false`, e o arquivo final SEM quebra de linha no fim. Depois
    refazer o `integrity` (ver item abaixo).
- **Portal: mexeu no `app.js`, refaz o `integrity` (2026-08-21).** O
  `public/portal/index.html` carrega os scripts com Subresource Integrity
  (`integrity="sha384-…"`). Se o arquivo muda e o hash não, o navegador
  **se recusa a executar** — sem erro na tela, o portal fica eternamente em
  "Carregando Portal Cali Colors…". Aconteceu ao corrigir a URL da API
  dentro do `app.js`. Receita: `openssl dgst -sha384 -binary
  public/portal/app.js | openssl base64 -A`, colar no `integrity` e bumpar
  o `?v=`. **E editar também o `app.jsx`** — ele é o FONTE do `app.js`
  compilado; corrigir só o compilado some na próxima compilação. O teste
  `__tests__/portalApiRoutes.test.ts` agora confere o hash do index contra
  o arquivo real (e varre `.jsx` junto com `.js`).
- **Portal admin chama `/api/admin/users` (2026-08-21).** "Habilitar PRO" e
  "Promover" davam `HTTP 404`: o `public/portal/app.js` (estático, chama a
  API por string) ainda apontava pra `/api/admin-users`, nome da antiga
  Cloudflare Function — na migração pro Next a rota virou
  `app/api/admin/users/route.ts`. As `action` (promote/revoke/set_pro/
  set_role/verify) e o `accessToken` no body já batiam; era só o caminho.
  Teste `__tests__/portalApiRoutes.test.ts` lê o fonte do portal e quebra se
  alguma URL de API não tiver `route.ts` — o type-check não pega string.
- **Login social Google + Apple (2026-06-18).** OAuth via Supabase.
  `AuthProvider.signInWithGoogle()`/`signInWithApple()` chamam
  `supabase.auth.signInWithOAuth({ provider })` com
  `redirectTo=${origin}/completar-perfil`. Botões reutilizáveis em
  `components/SocialAuthButtons.tsx` (Google branco + Apple preto),
  renderizados no `/login` (LoginForm, abaixo do "Entrar") e `/signup`
  (SignupFlow, topo do passo 1). **Provider Google e Apple já habilitados
  no painel Supabase** (Client ID/Secret + redirect URLs) — não pedir pra
  configurar. **Onboarding pós-OAuth**: `/completar-perfil` (page +
  `CompleteProfileForm`) é o landing do `redirectTo` — se o perfil já tem
  categoria (`user_type`/`role`) + `@tag`, manda pro `/feed`; senão pede
  categoria + nome + @tag (cidade/UF opcionais) e grava via
  `useProfile.update`. `ProfilePatch` ganhou `user_type` (o trigger
  `trg_sync_role_from_user_type` preenche `role`). O `/perfil/editar` NÃO
  serve pra isso (tag é readonly lá e não tem seletor de categoria).
  Lembrete: no Supabase, as Redirect URLs precisam cobrir
  `/completar-perfil` (recomendado wildcard `…/**` + preview pages.dev).
  - **Guard de cadastro incompleto (2026-08-21).** O `/completar-perfil` era
    a ÚNICA chance de preencher categoria + @tag: se o redirect do provedor
    não pousasse lá (Redirect URL fora da allowlist manda pro Site URL) ou a
    pessoa fechasse a aba, ficava com perfil pela metade pra sempre — sem
    @tag não aparece na busca nem tem link de perfil. Apareceram vários no
    `/portal` (Clientes com @TAG "—"). Agora o `AppShell` refaz o pedido:
    `isProfileComplete` (`lib/profileCompletion.ts`, regra compartilhada com
    o formulário) + `router.replace('/completar-perfil')`, e a tela privada
    não renderiza enquanto isso. **Só redireciona com o profile carregado
    sem erro** — query em voo ou falha de rede NÃO expulsam ninguém.
    Usuários antigos sem tag são pegos na próxima abertura.
- **Compliance Apple 3.1.3(e) — loja sem pagamento no app (2026-06-18).**
  A loja Cali Colors NÃO processa pagamento dentro do app: o cliente só
  monta a "Lista de Pedido" e a loja fecha a venda fora do app (WhatsApp).
  - **Removido o fluxo Mercado Pago da LOJA** (físicos): deletados
    `next-app/app/api/mp-checkout-loja/route.ts`,
    `next-app/lib/api/_services/mp-checkout-loja.ts` e o teste. `CartView`
    agora só chama `useCart.checkout()` → `submitOrder` (grava order
    `status='pending'` no Supabase), esvazia a lista e mostra "Pedido
    enviado! A equipe da Cali Colors entrará em contato via WhatsApp em
    breve.". Sem redirect pra URL externa de pagamento. Botões/títulos:
    "Selecionar" / "+ Selecionar item" / "Minha Lista de Pedido" /
    "Enviar Lista". Não havia rota de retorno (`?compra=` apontava pra `/`).
  - **PRO mantido, MAS sem checkout no app (por enquanto).** `ProView`
    (`next-app/app/pro/ProView.tsx`) não chama mais `startProCheckout` —
    mostra nota "Para ativar o plano PRO, entre em contato com a loja
    física Cali Colors pelo telefone (11) 95976-5031" + botão WhatsApp.
    Ativação é MANUAL (a loja seta `profiles.is_pro` no perfil). O
    `billing-platform.ts` + `/api/checkout` + `/api/mp-webhook` continuam
    no repo intactos (não deletados) pra retomar depois se decidirem.
  - `MP_ACCESS_TOKEN` ainda é usado por `/api/checkout` (PRO web) e
    `/api/mp-webhook` — NÃO remover a env.
- **Modo visitante (guest) — REMOVIDO (2026-06-18, a pedido do usuário).**
  O app voltou a EXIGIR login. O guard fica no `AppShell` (`components/
  AppShell.tsx`): se `!loading && !user`, `router.replace('/login?next=…')`
  e não renderiza o conteúdo privado. Toda tela embrulhada em AppShell é
  privada; páginas públicas (`/login`, `/signup`, `/`, `/info/*`,
  `/delete-account`, `/completar-perfil`) NÃO usam AppShell, então seguem
  acessíveis. Raiz `/` agora manda logado→`/feed`, deslogado→`/login`. O
  botão "Explore o app sem cadastro" já tinha sido removido do `/login`. O
  `AuthGate` continua no repo mas fica inerte dentro do AppShell (user
  sempre presente) — não removido. As policies anon-read da loja
  (`2026-06-15-loja-anon-read.sql`) seguem no banco, inofensivas (sem anon
  agora); não precisa reverter.
- **Badge de chat não lido (TopNav) — fix LIVE (2026-06-15).**
  `useUnreadMessageCount` revalida tb no INSERT de `notifications` (mesmo
  evento que acende o sininho, comprovadamente entregue) + refetchOnWindowFocus
  + staleTime 15s. O realtime da tabela `messages` não disparava o badge no DB
  live; piggyback no sininho garante que acenda junto.
- **Perf loja (2026-06-15) — LIVE.** `useProducts` filtra busca debounced
  (250ms); `ProductsList` renderiza em janela (40 cards, cresce via
  IntersectionObserver) em vez de montar a lista flat inteira (~4k).

- **RELEASE_AUDIT.md (2026-06-11) — 9 blockers atacados.** Auditoria de
  release nas lojas (Apple App Store + Google Play) em `RELEASE_AUDIT.md`.
  Status atual:
  - **C1 Billing platform**: abstração em `next-app/lib/services/billing-platform.ts`
    detecta web/iOS-wrapper/Android-wrapper e roteia checkout pra
    MP/StoreKit/Play Billing. `/api/play-billing-verify` e
    `/api/apple-iap-verify` são STUBS (aceitam token sem call ao server
    do Apple/Google) — TODO antes de production. Doc: `docs/BILLING_STRATEGY.md`.
  - **C2+C7 iOS scaffold**: `capacitor.config.ts` + `ios/App/App/Info.plist`
    + `ios/App/App/PrivacyInfo.xcprivacy` + `AppDelegate.swift` versionados.
    Falta user instalar Capacitor + rodar `npx cap add ios` em macOS +
    Xcode. Doc: `docs/IOS_BUILD.md`.
  - **C3 Android TWA**: `twa-manifest.json` raiz, `docs/ANDROID_BUILD.md`.
    `.well-known/assetlinks.json` tem SHA-256 + package_name placeholders;
    user precisa gerar keystore via `bubblewrap build` e atualizar.
  - **C4 CSAM (SQL Wave 29)**: tabelas `media_hash_blocklist` +
    `media_review_queue` + coluna `posts.media_hash`. `/api/moderate` agora
    aceita `mediaUrl`, calcula hash SHA-256, checa blocklist (curto-circuita
    Gemini em hit), enfileira review em severity hard+. Admin queue em
    `/admin/media-review`. **SQL JÁ EXECUTADO (2026-06-12).** Falta o
    Cloudflare CSAM Scanning Tool: **NÃO é toggle de painel** (a página
    `/stream/csam` carrega em branco) — exige opt-in legal manual, o
    titular da conta tem que contatar o suporte CF ou mandar email pra
    `cloudflare-csam@cloudflare.com` e assinar o NCMEC Reporting
    Agreement. Doc: `docs/CSAM_POLICY.md`.
  - **C5 age gate <16**: `MIN_AGE=16` em `lib/schemas.ts`, `birthDateSchema`
    obrigatório no signup, revalidação server-side em `signup.ts`. Tests
    cobrindo. ✓ Live.
  - **C6 email verification enforce**: `AuthProvider.emailVerified`
    bloqueia `usePublishPost`, `useComments.add`, `useSendMessage`.
    `<EmailVerifyBanner>` amarelo global com botão reenviar. ✓ Live.
  - **C8 Push Notifications (SQL Wave 30)**: Web Push API end-to-end —
    VAPID JWT ES256 + aes128gcm AES-GCM em `/api/push-notify` (zero deps).
    Tabela `push_subscriptions` + RLS user-owned + trigger pg_net dispara
    push em insert de `notifications`. `<PushOptIn>` no ProfileFooter.
    **SQL AINDA NÃO RODADO** — colar do agent result, habilitar `pg_net`,
    rodar 2 ALTER DATABASE pra setar `app.push_notify_url` e
    `app.push_internal_secret`. Falta gerar VAPID keys e setar 4 ENVs no
    CF Pages: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
    `VAPID_SUBJECT`, `PUSH_INTERNAL_SECRET`. Doc: `docs/PUSH_NOTIFICATIONS.md`.
    iOS: só funciona iOS 16.4+ em modo PWA "Adicionar à Tela de Início".
  - **C9 `/delete-account` web URL**: página pública pra Google Play Policy
    2023. Logado: renderiza DeleteAccountSection. Deslogado: CTA login
    com `?next=/delete-account` (whitelist em `LoginForm`). ✓ Live.
- **5 CRITICALs do audit 2026-06-12 FECHADOS.** Detalhes em
  `next-app/lib/utils/sanitize.ts`, `next-app/lib/auth-server.ts`,
  `next-app/lib/api/env-check.ts` e nos commits `22b6dc9`, `91927d2`,
  `650e7b8`, `047a147`, `948c21a`:
  - **CRIT-1 IAP stubs**: `/api/{play-billing,apple-iap}-verify` agora
    retornam 503 sem `IAP_PRODUCTION_VERIFICATION_ENABLED=true`. NÃO
    setar essa env até implementar verificação real (Google Play
    Developer API + Apple verifyReceipt).
  - **CRIT-2 MP webhook**: fail-closed em prod sem `MP_WEBHOOK_SECRET`.
    Rejeição vai pra `audit_log` (`action='mp.webhook.rejected_no_secret'`).
  - **CRIT-3 XSS Search**: `sanitizeSearchSnippet()` no frontend
    (escape HTML + sentinelas `⟦HL_OPEN⟧`/`⟦HL_CLOSE⟧` viram `<b>`).
    **SQL Wave 31 JÁ EXECUTADO** (`search_all` recria com sentinelas
    no `ts_headline`). Defesa em profundidade ativa.
  - **CRIT-4 Admin RSC auth**: `requireAdminServer()` em todas as 6
    pages `/admin/*`. Login agora grava cookie httpOnly
    `sb-session-token` via `/api/auth/set-session-cookie` (POST=set,
    DELETE=clear no signOut). **Admins precisam logar uma vez após
    o deploy pra gerar o cookie.** Sessões anteriores não habilitam
    `/admin/*` (vão pra 404).
  - **CRIT-5 requirePro fail-closed**: `requirePro()` e `gateAiUsage()`
    em prod sem `SUPABASE_SERVICE_ROLE_KEY` retornam 503. Boot check
    `assertProductionEnvs()` chama no module-load do `security.ts`;
    em vitest skipa salvo `{ force: true }`.
- **Fase 4 etapa 2 da modularização: COMPLETA (2026-05-31).** `app.js`
  caiu de **9176 → 1299 linhas (-86%)**. 338 funções foram extraídas em
  44 módulos sob `modules/*.js` (cada um é um IIFE registrando
  `window.Modules.X`). O bridge `shims.js` republica
  `Modules.X.fn → window.fn` (+ `Utils.X → window.X`) e carrega ANTES do
  `app.js` no `index.html` pra que bare calls em boot-code já tenham as
  globals wireadas. **HTML inline handlers (`onclick="loadFeed()"`)
  continuam funcionando** — toda função visível ao HTML segue exposta como
  `window.X` via shim. NÃO refatorar HTML pra `addEventListener` sem
  necessidade; o padrão IIFE+shim é deliberado pra preservar o contrato.
  85 testes unitários cobrem o que migrou (shims + policies + db +
  schemas + security). Para detalhes ver `ARCHITECTURE.md`.
- **Sentry** **JÁ ESTÁ CONECTADO ao GitHub do projeto** (integração de
  releases/commits/issues entre Sentry ↔ GitHub). Convive com a tabela
  caseira `errors` + dashboard `/admin/errors`; ainda não há decisão se o
  Sentry vira a fonte primária ou só complemento. Se o usuário quiser ligar
  o DSN do Sentry no frontend (sendo carregado pelo browser) ou no
  `/api/log-error` (forwarding server-side), perguntar a variável de env
  exata (`SENTRY_DSN` provavelmente) e os hosts permitidos no CSP
  (`https://*.sentry.io` em `connect-src`).
- O SQL de correção do cadastro ("Database error saving new user" — gatilho
  `handle_new_user` + colunas de `profiles`) **JÁ FOI EXECUTADO no Supabase**.
  Não perguntar de novo nem pedir para rodar.
- Regra de fluxo: após cada correção/melhoria concluída, fazer commit no
  branch de trabalho e **merge para `main`** automaticamente (deploy do
  Cloudflare Pages é automático a partir do `main`).
- **Preview deploys do Cloudflare Pages**: toda branch que NÃO é `main`
  ganha um preview deploy automático em `<branch-slug>.queroumacorapp.pages.dev`.
  Pra features arriscadas (mudanças visuais, fluxos críticos, refactors),
  testar primeiro no preview antes do merge. App mostra banner amarelo
  "🧪 STAGING" no topo quando rodando fora de `queroumacor.com.br`. Detalhes
  do workflow em `STAGING.md`.
- **Após cada merge pra `main`**, aguardar a janela típica de deploy do
  Cloudflare Pages (~90s a partir do push) usando Bash com `run_in_background`
  (`sleep 90 && echo deploy-pronto`) e, quando a notificação chegar, avisar o
  usuário que **provavelmente** está no ar — sendo explícito que é tempo
  decorrido, não confirmação real (egress do container bloqueia
  `queroumacor.com.br` com `host_not_allowed`, e o GitHub MCP não expõe status
  de deploy do Cloudflare Pages). Pedir confirmação do lado do usuário.
- Branch de trabalho atual: `claude/new-session-V0v78`.
- `OPENAI_API_KEY` **e** `GEMINI_API_KEY` **já estão configuradas no Cloudflare
  Pages**. Não perguntar de novo. (Usadas por `chat-ai.js` e
  `resolve-color.js`.)
- A coluna `products.image_url` (text) **já foi criada no Supabase**. Upload
  de foto de produto pelo portal já funciona. Não pedir para rodar o SQL.
- O SQL de persistência total (tabela `checklists` + colunas
  `profiles.service_radius` e `profiles.archived_conversations`) **JÁ FOI
  EXECUTADO no Supabase**. Checklist de obra, raio de atendimento e
  conversas arquivadas agora persistem no banco. Não pedir para rodar de
  novo. Nenhum dado de usuário fica só em `localStorage` (o que sobra lá
  são apenas caches cuja fonte de verdade já é o Supabase).
- O SQL do carrinho e estados de usuário (colunas `profiles.cart`,
  `profiles.ai_logo_gen_count` e `profiles.seen_stories`) **JÁ FOI
  EXECUTADO no Supabase**. Carrinho da loja, contador de logo IA e
  stories vistos persistem no banco. Não pedir para rodar de novo.
- Cores de produto: o botão "Preencher cores (IA)" no portal grava
  `products.color_hex` (IA primeiro, dicionário como fallback). Rodar
  **uma vez**; depois manutenção é manual via seletor de cor. O botão só
  toca em produtos sem cor — seguro reapertar.
- O SQL dos 3 furos de integração (coluna `profiles.review_count`,
  policy de INSERT em `referrals`, triggers `award_referral_points` e
  `recalc_painter_rating`) **JÁ FOI EXECUTADO no Supabase**. Indicações
  gravam linha em `referrals`, pontos por indicação/avaliação recebida
  são creditados por trigger, e `profiles.rating_avg` + `review_count`
  recalculam a cada review. Não pedir para rodar de novo.
- As tabelas `notes` (anotações) e `notifications` (sininho) **JÁ FORAM
  CRIADAS no Supabase** (com RLS e realtime). Anotações salvam/carregam
  e os avisos do `notify()` chegam no sininho. Não pedir para rodar de
  novo.
- **Dados oficiais da Cali Colors (operadora/dona do QueroUmaCor)**:
  - Razão social: **CALICOLORS TINTAS LTDA**
  - CNPJ: **47.677.346/0001-92**
  - Endereço: **Est. Presidente Juscelino Kubitschek de Oliveira, 1071**
  - Bairro: **Jardim dos Pimentas**
  - Cidade/UF: **Guarulhos/SP**
  - CEP: **07.272-345**

  Usar esses dados nos documentos legais (termos, privacidade, sobre),
  metadados do Play Console / App Store, headers do CNPJ no PDF de
  orçamento se o pintor for da Cali Colors, e onde mais precisar de
  identificação formal do controlador LGPD. Já gravados em
  `next-app/app/info/privacidade/page.tsx`, `.../termos/page.tsx`,
  `.../sobre/page.tsx`.

- **Contato da Cali Colors** (atendimento / suporte / "Fale Conosco" /
  solicitações de exclusão de conta LGPD): WhatsApp `(11) 95976-5031`
  (formato wa.me `5511959765031`), e-mail `loja@calicolors.com.br`. Já
  configurado no objeto `SUPPORT` em `app.js`. Usar esse contato sempre
  que precisar de um canal de atendimento/suporte no app.
- **Cache-busting (IMPORTANTE):** `index.html` carrega `head.js` e
  `app.js` com `?v=AAAAMMDD<letra>` (ex.: `?v=20260522a`). **SEMPRE que
  mudar `app.js` ou `head.js`, bump esse `?v=`** nas duas tags `<script>`
  (ex.: `20260522a` → `20260522b`). Se não bumpar, o navegador serve o JS
  velho do cache e a correção não chega no usuário.
- **Regra de SQL:** sempre que criar ou alterar qualquer SQL/migration,
  **colar o conteúdo completo do SQL no chat, em texto** (bloco de código),
  para o usuário copiar e rodar no Supabase SQL Editor. Criar só o arquivo
  no repo não basta — o SQL tem que aparecer no chat. Claude não tem acesso
  ao banco para rodar.
- **SQL Wave 3 (hardening pós-auditoria 26/05) JÁ FOI EXECUTADO no Supabase.**
  Inclui: trigger `protect_profile_columns` BEFORE INSERT OR UPDATE (impede
  escalada de `is_pro`/`portal_access`/`role=admin` via INSERT), UNIQUE em
  `points(source, reference_id)` (anti double-credit), policies de SELECT
  restritas a `authenticated` em `follows`/`likes`/`comments`/`qualifications`/
  `courses`, view `announcements_public` (esconde `created_by`), policy
  deny-all em `rate_limits`, restauração do SELECT público de `reviews`, e FK
  `announcements.created_by` com `ON DELETE SET NULL`. Não pedir para rodar
  de novo.
- **Coluna `profiles.birth_date` (date) JÁ FOI CRIADA no Supabase.** Campo
  preenchido no signup, sem bloqueio etário. Não pedir para rodar de novo.
- **Mailbox `loja@calicolors.com.br` está ativa e responde.** Não perguntar.
- **Turnstile (CAPTCHA)** — está carregado no `index.html` mas nenhum
  endpoint server-side valida o token (`siteverify`). O usuário pediu para
  deixar assim por enquanto. Não wirar a validação sem ele pedir.
- **Google Search Console verificado** via DNS TXT em `queroumacor.com.br`.
  Meta tag também está no `<head>` do `index.html`. Sitemap submetido em
  `https://www.queroumacor.com.br/sitemap.xml`. Não mexer/remover a meta tag.
- **HSTS preload — SUBMETIDO (2026-05-31).** Header em `_headers` agora é
  `max-age=31536000; includeSubDomains; preload`. **Pegadinha resolvida**:
  Cloudflare Edge HSTS (SSL/TLS → Edge Certificates → HSTS) estava
  sobrescrevendo o `_headers` com a flag Preload OFF — foi ativado no
  painel CF. Domínio `queroumacor.com.br` submetido em hstspreload.org,
  validado verde, na fila pra entrar na preload list do Chromium
  (~semanas-meses pra propagar via update de Chrome → Firefox/Safari).
  **Não submeter outros subdomínios sem garantir HTTPS perpétuo** —
  remoção da preload list leva 6+ meses.
- **DMARC pendente em `calicolors.com.br`** (não-bloqueante). O domínio
  `queroumacor.com.br` já tem DMARC `p=reject`. Falta o usuário adicionar
  no GoDaddy o TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:dpo@calicolors.com.br`.
  Não é code-actionable — só ele pode mexer no DNS.
- **SQL Wave 4 — tabelas `reports` e `feature_interest` JÁ FORAM CRIADAS no
  Supabase.** Fixa 2 bugs achados na auditoria de rede social: (1) `app.js
  submitReport()` que estourava erro porque a tabela `reports` não existia;
  (2) `app.js abrirMaquininha/entrarListaMaquininha` que perdiam silenciosamente
  os cliques de interesse (tabela `feature_interest` inexistente). Não pedir
  para rodar de novo.
- **SQL Wave 5 (2026-05-31) — JÁ EXECUTADO no Supabase.** Tabelas
  `consent_log` (LGPD trilha de consentimento por tipo/versão, RLS user-owned),
  `audit_log` (auditoria de ações administrativas — admin reads via
  `is_portal_admin()`; convive com `audit_events` granular trigger-driven),
  `invite_codes` (expiração default 30 dias + `invite_code_valid(text)` RPC),
  função `cleanup_orphan_media()` + `execute_cleanup_orphan_media()`
  (admin-only, deleta arquivos do bucket `posts` sem post referenciando, com
  janela de 7 dias). Cleanup retroativo de `audit_log > 1 ano` via
  `cleanup_old_audit_log()`. Migration única em
  `/migrations/2026-05-31-consent-audit-invites-cleanup.sql`. Client TS de
  consent em `next-app/lib/services/consent.ts`. Trocar para "JÁ EXECUTADO"
  após o usuário rodar no SQL Editor.
- **Bucket Supabase `style-refs` JÁ FOI CRIADO** (público pra leitura, com
  policy `"style-refs public read"` em `storage.objects` só pra SELECT, sem
  policy de INSERT/UPDATE/DELETE — só o endpoint `/api/upload-style-ref`
  escreve via `service_role` depois de validar `ADMIN_EMAILS`). Usado pela
  feature "Arte pra Instagram" pra armazenar templates visuais por estilo
  (`profissional.jpg`, `trabalho.jpg`, `antesdepois.jpg`) que admin sobe pelo
  botão ✏️ no tile. Backend `ig-art.js` carrega de lá primeiro, com fallback
  pra `/style-refs/<key>.jpg` no repo. Não pedir pra rodar SQL desse bucket
  de novo.
- **Plano Supabase: PRO ($25/mês).** Não estamos mais no free tier. Recursos
  adicionais: 8GB DB, 50GB bandwidth, 7 dias de PITR (point-in-time recovery),
  100GB storage, sem project pause por inatividade, log retention de 7 dias.
  Quando sugerir feature que precisa de mais compute / storage / backup,
  pode contar com isso.
- **Plano Cloudflare: PRO.** Recursos adicionais disponíveis: WAF managed
  rules customizáveis, Image Resizing/Polish, mobile redirect, web analytics
  RUM, page rules adicionais. Workers/Pages tem cota maior. Quando sugerir
  feature de perf/edge (image optim, custom WAF rule), pode contar com isso.
- **Backlog / roadmap:** ver `BACKLOG.md` na raiz. Lista categorizada de
  features pendentes (sociais estilo IG, perf, observability, segurança
  externa). Sempre consultar antes de propor features novas — se já está
  no backlog, referenciar pelo ID (ex.: "atacar S1 + S6 do BACKLOG.md").
- **NUNCA consultar o MCP Supabase no queroumacor** a menos que o usuário
  peça explicitamente. O MCP atual está conectado a OUTRO projeto Supabase
  (não o queroumacor `uwqebaqweehiljsqkifm.supabase.co`), então qualquer
  `execute_sql`/`list_tables`/`apply_migration` via MCP vai pro projeto
  errado. Pra mexer em SQL do queroumacor, colar o SQL no chat e o usuário
  roda no SQL Editor.
- **Bucket `posts` agora aceita vídeo.** `allowed_mime_types` inclui
  `image/jpeg|png|webp|gif|heic|heif` + `video/mp4|quicktime|webm`, e
  `file_size_limit` em 50 MB. SQL já foi rodado no SQL Editor. Frontend
  já manda `contentType` explícito no upload. Não pedir pra rodar de novo.
- **`profiles.tag` e `profiles.username` agora são sinônimos sincronizados
  automaticamente.** SQL já rodado: trigger `sync_profile_tag_username`
  BEFORE INSERT/UPDATE preenche o lado vazio com o outro e propaga
  mudanças entre os dois campos. View `profiles_public` projeta
  `tag = coalesce(tag, username)` e `username = coalesce(username, tag)`,
  então frontend continua usando `p.tag` (e o app só escreve em `tag`) —
  pega valor de qualquer coluna que esteja preenchida. View NÃO tem mais
  as colunas `palette` nem `country` (não existem no banco real, foram
  removidas em algum momento). Não pedir pra rodar de novo.
- **SQL Wave 6 (2026-05-31) — JÁ EXECUTADO no Supabase.** Full-text
  search (Banco#9): colunas geradas `search_vector tsvector` em `posts`
  (caption), `products` (name + description com pesos A/B) e `profiles`
  (name + bio + tag com pesos A/B/A), todas com índice GIN. Função RPC
  `search_all(p_query text, p_limit int)` agrega resultados das 3 tabelas
  (com `plainto_tsquery('portuguese')`, `ts_headline` pra snippet e
  `ts_rank` pra score), filtrando posts por `status='approved'`. Migration
  única em `/migrations/2026-05-31-fulltext-search.sql`. Service TS em
  `next-app/lib/services/search.ts`, hook `useSearch` com debounce 300ms,
  página `/search` com input + grupos (Pintores/Posts/Produtos). Trocar
  para "JÁ EXECUTADO" após o usuário rodar no SQL Editor.
- **SQL Wave 7 (2026-05-31) — JÁ EXECUTADO no Supabase.**
  Hardening pagamentos/subscription (Pagamentos#11, #17, #18, #19):
  (1) tabela `invoices` (rastreio de cobrança/refund pra conciliação MP, RLS
  user-owned read; write só via service_role); (2) coluna
  `profiles.pro_grace_until` + função `is_pro_active(uuid)` que considera
  grace period de 3 dias (canSeeProFeature client + gateAiUsage server-side
  usam); (3) tabela `ai_usage` (audit de uso de IA por feature, RLS
  user-owned read; write só via service_role) + RPC
  `ai_usage_this_month(uuid, text?)`; (4) tabela `plan_limits` (free=30,
  pro=500, admin=99999 calls/mês, public read); (5) trigger
  `handle_invoice_paid` (transição `invoices.status → 'paid'` em
  type=subscription propaga `is_pro=true + pro_expires_at +30d` no profile);
  (6) RPC `upsert_invoice(...)` (idempotente por `external_id`, usado pelo
  mp-webhook). Migration única em
  `/migrations/2026-05-31-payments-hardening.sql`. Service novo em
  `next-app/lib/services/billing.ts`; helpers REST edge-friendly em
  `next-app/lib/api/_services/_billing-helpers.ts`; security wrapper
  `gateAiUsage` + `recordAiUsage` em `next-app/lib/api/security.ts`. Todas
  as 14 rotas de IA (`chat-ai`, `caption`, `transcribe`, `tts`,
  `generate-logo`, `area-from-photo`, `pricing-suggest`, `fin-analysis`,
  `crm-draft`, `agenda-order`, `resolve-color`, `moderate`,
  `moderate-video`, `ig-art`) agora chamam `gateAiUsage` antes da IA e
  `recordAiUsage` depois do sucesso. `policies.ts canSeeProFeature` foi
  estendida pra considerar `pro_grace_until`. 21 testes novos em
  `__tests__/services/billing.test.ts` + 5 testes novos em
  `__tests__/policies.test.ts`. Trocar para "JÁ EXECUTADO" após o usuário
  rodar no SQL Editor.
- **SQL Wave 8 (2026-05-31) — soft delete + undo — JÁ EXECUTADO no
  Supabase.** Mira UX#5 (undo de delete) + Banco#13 (soft delete em vez de
  hard). Adiciona coluna `deleted_at timestamptz` em `posts`, `notes`,
  `messages`, `comments`, `quotes`, `checklists`. Atualiza policies de
  SELECT pra esconder rows soft-deleted; admin (`is_portal_admin()`) e
  owner ainda enxergam pra desfazer/auditoria. Indexes parciais
  `idx_<tbl>_active` (`WHERE deleted_at IS NULL`) otimizam queries normais.
  Função `cleanup_soft_deleted()` (SECURITY DEFINER, GRANT só pra
  `service_role`) faz hard delete em rows soft-deleted > 30 dias — chamar
  por cron (pg_cron) ou manualmente. Frontend só em `next-app/`: services
  `postInteractions.deletePost/undoDeletePost/softDeleteComment/undoDeleteComment`,
  `notes.softDeleteNote/undoDeleteNote`, `chat-messages.softDeleteMessage/undoDeleteMessage`,
  todos retornam `{ undoToken }`. Hooks `useDeletePost`, `useDeleteComment`,
  `useDeleteMessage`, `useNotes` expõem `remove + undo`. UI: componente
  `<UndoSnackbar message onUndo>` (countdown 10s) + hook genérico
  `useUndoable<TArgs>` empacotando ciclo. Migration única em
  `/migrations/2026-05-31-soft-delete.sql`. Trocar para "JÁ EXECUTADO"
  após o usuário rodar no SQL Editor.
- **SQL Wave 15 (2026-06-09) — índices de perf — JÁ EXECUTADO no
  Supabase.** 3 índices parciais cobrindo caminho crítico:
  `idx_comments_post_active_created` (post_id + created_at WHERE
  deleted_at IS NULL) acelera `fetchComments`;
  `idx_notifications_user_unread_created` (user_id + created_at WHERE
  read=false) acelera o badge do sininho;
  `idx_posts_approved_active_created` (created_at WHERE status=approved
  AND deleted_at IS NULL) acelera o feed "Todos". Criados
  CONCURRENTLY (sem lock). Migration em
  `/migrations/2026-06-09-perf-indexes.sql`. Não pedir pra rodar de novo.
- **SQL Wave 16 (2026-06-09) — RPC `get_feed_v2` — JÁ EXECUTADO no
  Supabase.** Função SQL agregando posts + autor + like_count +
  comment_count + liked_by_me + saved_by_me + top 3 comments em UMA
  chamada. Substitui o trio Wave A + Wave B do `fetchFeed` (5
  round-trips → 1). **A função existe mas o frontend AINDA NÃO chama
  ela** — swap em `next-app/lib/services/feed.ts:127 fetchFeed()` é a
  Sprint 1.5 (ficou pendente porque user pulou pro Sprint 2 antes).
  Migration em `/migrations/2026-06-09-rpc-get-feed-v2.sql`. Não pedir
  pra rodar SQL de novo.
- **B7 (Web Vitals RUM via Sentry) — DEPLOYADO em 2026-06-09.**
  `sentry.client.config.ts` agora carrega `browserTracingIntegration`
  com `tracesSampleRate: 1.0`. Sentry → Performance → Web Vitals
  começa a popular ~24h depois do primeiro acesso. Não mexer no sample
  rate sem checar quota.
- **B2 (Cloudflare Image Resizing) — código DEPLOYADO mas REQUER
  toggle no painel CF pra valer.** Helper `next-app/lib/cfImg.ts`
  reescreve URLs pra `/cdn-cgi/image/w=...,q=85,f=auto/<original-url>`.
  Avatar e PostMedia usam srcset 1x/2x/3x. **Pra ganhar perf, ligar no
  Cloudflare Dashboard:** Speed → Optimization → **Image Resizing ON**
  + "Resize images from any origin" **ON** + Polish em **Lossy**.
  Enquanto não liga, as `<img>` caem no `onError` e mostram placeholder
  (sem regressão fatal, mas sem ganho). Anotar aqui quando user ligar.
- **SQL Wave 17 (2026-06-09) — width/height em posts (CLS=0) — JÁ
  EXECUTADO no Supabase.** P4 do BACKLOG. Adiciona `posts.media_width`
  e `posts.media_height` (int, opcionais). `usePublishPost` captura
  W/H da primeira imagem via `readImageDimensions()` antes do upload e
  grava no insert. `PostMedia` seta `width={...} height={...}` no
  `<img>` quando presente — browser reserva espaço exato e CLS = 0.
  Posts antigos sem W/H caem no `aspect-ratio: 1/1` CSS (sem
  regressão). RPC `get_feed_v2` foi DROP+CREATE pra incluir as 2
  colunas no RETURNS TABLE. Migration em
  `/migrations/2026-06-09-posts-media-dimensions.sql`. Não pedir pra
  rodar de novo.
- **SQL Wave 18 (2026-06-09) — policies admin pra `reports` — JÁ
  EXECUTADO no Supabase.** O3 do BACKLOG. Adiciona `reports_select_admin`
  e `reports_update_admin` (USING/WITH CHECK `is_portal_admin()`).
  Convive com as policies restritivas existentes via OR. Dashboard em
  `/admin/reports` (RSC shell + `ReportsAdmin` client component) lista
  denúncias por status (pending/reviewed/resolved/dismissed/all) com
  botões Resolver/Dispensar/Marcar revisado. Service em
  `next-app/lib/services/adminReports.ts`. Migration em
  `/migrations/2026-06-09-admin-reports-policies.sql`. Não pedir pra
  rodar de novo.
- **S13 (Modo escuro) — REINTRODUZIDO como OPT-IN (2026-06-18, a pedido
  do usuário).** Foi revertido em 2026-06-10 (commit `d0d0e7d`) e voltou
  agora. App continua **claro por padrão**; o escuro só liga quando o
  usuário ativa o `ThemeToggle` (`components/ThemeToggle.tsx`, renderizado
  no `ProfileFooter`). Hook `lib/hooks/useTheme.ts` (recriado) grava
  `localStorage.theme`; o script inline no `<head>` do `layout.tsx` lê a
  chave antes do paint e seta `data-theme` (`dark` só se salvo
  explicitamente — NÃO seguimos `prefers-color-scheme`). Os tokens dark
  vivem em `:root[data-theme='dark']` no `globals.css` (Tailwind v4 compila
  `bg-white`/cores arbitrárias pra `var(--color-*)`, então sobrescrever os
  tokens cobre quase tudo). `--color-ink-fixed` NÃO inverte (TopNav/
  BottomNav/ProfileHeader seguem escuros com texto branco fixo). Pendência
  conhecida menor: 3 badges em `/admin/*` usam `bg-gray-100 text-gray-700`
  (pílula clara em página escura, mas texto escuro = legível; admin-only).
- **SQL Wave 19 (2026-06-09) — policy admin pra `feature_interest` —
  JÁ EXECUTADO no Supabase.** O2 do BACKLOG. Adiciona
  `feature_interest_select_admin` (SELECT TO authenticated USING
  `is_portal_admin()`). Sem UPDATE/DELETE — tabela é append-only.
  Dashboard em `/admin/feature-interest` (RSC shell +
  `FeatureInterestAdmin` client component) mostra resumo agregado por
  feature (count + último click) com drill-down em lista de cliques
  recentes (usuário + ação + contato + tempo). Service em
  `next-app/lib/services/adminFeatureInterest.ts`. Migration em
  `/migrations/2026-06-09-admin-feature-interest-policy.sql`.
- **Telemetria fetchFeed (Sprint 4 polish) — DEPLOYADO em 2026-06-09.**
  `lib/services/feed.ts` agora chama `addFeedBreadcrumb()` em 3 caminhos:
  `rpc_ok` (sucesso, com row count), `rpc_error` (RPC retornou error,
  fallback legacy), `rpc_throw` (RPC throw, fallback). Breadcrumb vai
  pro Sentry e aparece como contexto em qualquer erro futuro do feed.
  Usar pra decidir quando remover o fallback legacy: se Sentry mostra
  só `rpc_ok` por semanas → seguro firmar.
- **SQL `/migrations/2026-06-09-perf-indexes-check.sql` — NÃO É
  MIGRATION, é auditoria.** Roda EXPLAIN ANALYZE nas 3 queries
  esperadas pelos índices Wave 15 + lista tamanho/scan count via
  `pg_stat_user_indexes`. Cole no SQL Editor pra confirmar que os
  índices estão sendo escolhidos pelo planner. "Seq Scan" no plano =
  índice não cobre, refazer.
- **SQL Wave 22 (2026-06-09) — boost + trending (S11/S12) — JÁ
  EXECUTADO no Supabase.** Coluna `posts.boosted_until timestamptz`
  (NULL = sem destaque) + índice parcial
  `idx_posts_boosted_active WHERE boosted_until > now()`. RPCs:
  `boost_post(uuid, int days=7)` valida ownership + PRO/portal, atomic
  swap (limpa boost ativo anterior do mesmo user antes de aplicar; 1-30
  dias); `unboost_post(uuid)` cancela. `get_feed_v2` recriada
  inserindo até 3 posts boosted no TOPO da PRIMEIRA página (cursor
  NULL); páginas seguintes não inflam — boosted reaparece só por
  created_at. `get_trending_posts(limit, window_days)` retorna posts
  ordenados por score = likes_window + 3*comments_window, exclui
  blocked do user logado, default 7 dias. Frontend: serviços
  `boost.ts` + `trending.ts`, badge "Em destaque" no topo do PostCard
  com gradient laranja, menu opt "Destacar 7 dias (PRO)" / "Remover
  destaque" no opts (só dono), página `/explore` (RSC + client
  `TrendingGrid`) grid 3 colunas com score no canto, atalho
  "Em alta esta semana" no `/search` quando input vazio.
  Migration em `/migrations/2026-06-09-boost-trending.sql`.
- **SQL Wave 23 (2026-06-09) — fix B1 badge verified no feed — JÁ
  EXECUTADO no Supabase.** `get_feed_v2` (Wave 22) omitia `verified` no
  jsonb_build_object do author, então o badge ✓ S1 (Wave 20) só
  renderizava no fallback legacy. DROP+CREATE adicionando
  `'verified', pr.verified` no author_json. Toda a lógica de
  boosted_until + blocks idêntica à Wave 22. Migration em
  `/migrations/2026-06-09-feed-verified-fix.sql`. Não pedir pra rodar
  de novo.
- **SQL Wave 24 (2026-06-10) — unread chat (TopNav badge) — JÁ
  EXECUTADO no Supabase.** Coluna `messages.read_at timestamptz`
  (NULL = não lida) + índice parcial `idx_messages_receiver_unread`
  (receiver_id + created_at WHERE read_at IS NULL AND deleted_at IS
  NULL). RPCs `mark_conversation_read(p_conv_id text)` (SECURITY
  DEFINER, marca todas as msgs da conv onde receiver = auth.uid()) e
  `unread_message_count()` (count total do user logado). Frontend:
  service `chat-messages.markConversationRead/fetchUnreadMessageCount`,
  hook `useUnreadMessageCount` (espelha o de notif: COUNT + realtime
  subscribe em messages filtered by receiver_id), TopNav lê do hook e
  renderiza badge com número (99+ pra >99) — prop `hasUnreadChat`
  removida (era sempre false). ChatConversation chama
  `markConversationRead` em useEffect ao montar. Migration em
  `/migrations/2026-06-10-messages-read-at.sql`.
- **SQL Wave 25 (2026-06-10) — variantes de tamanho de produto — JÁ
  EXECUTADO no Supabase.** Tabela `product_variants(id, product_id FK
  products ON DELETE CASCADE, size_label text, volume_ml int, price
  numeric CHECK >= 0, stock int, sort_order int, created/updated_at)`
  com UNIQUE em (product_id, size_label), índice
  idx_product_variants_product_sort, trigger updated_at via
  set_updated_at(). RLS: SELECT public (anon+authenticated) pra
  catálogo aberto; INSERT/UPDATE/DELETE só `is_portal_admin()`. Modelo
  1:N — products.price segue valendo como fallback quando o produto
  não tem variantes cadastradas (compat). Frontend: service
  `fetchProductVariants` (cast manual pq tabela ainda não está no
  schema TS gerado, rodar `supabase gen types` depois), hook
  `useProductVariants`, ProductDetailSheet renderiza seletor visual
  de chips quando há variantes (cada chip mostra label + preço,
  clique muda preço/CTA). addItemToCart compõe id do CartItem como
  `productId:variantId` pra cada tamanho contar como linha separada
  no carrinho. CartItem já mostra `volume` que agora carrega
  size_label. Base atual da Cali Colors tem 4171 produtos SEM
  variantes — admin precisa popular `product_variants` pra ativar
  seletor (decisão pendente: botão "Gerar variantes" no admin ou
  SQL bulk com regra de preço por proporção). Migration em
  `/migrations/2026-06-10-product-variants.sql`.
- **SQL Wave 26 (2026-06-10) — biblioteca de artes (AR Grafite) — JÁ
  EXECUTADO no Supabase.** Tabela `art_references(id, user_id FK
  profiles ON DELETE CASCADE, title, image_url, tags text[], width,
  height, created/updated_at)` com índices b-tree em (user_id,
  created_at DESC) e GIN em tags, RLS owner-only, trigger updated_at.
  Bucket Supabase Storage `art-refs` (criado pela UI: public read,
  20MB, mime jpeg/png/webp) com policies em `storage.objects` gating
  por `split_part(name, '/', 1) = auth.uid()::text` (path pattern
  `userId/uuid.ext`). Sprint 1 da feature AR Grafite: pintor/grafiteiro/
  admin sobe imagens em `/perfil/grafites` (tile na BusinessGrid
  '🎨 AR Grafite' via ROLE_TILES + ROUTE_TILES pra navegar em vez de
  bottom-sheet). Service `artReferences.ts` faz upload no bucket +
  insert na tabela; cast manual no `from` (tabela fora do schema TS
  gen). Hook `useArtReferences`. **Sprint 2 entregue (2026-06-10)**:
  componente novo `ArtAROverlay` (`app/perfil/grafites/ArtAROverlay.tsx`)
  — câmera ao vivo via getUserMedia (back facing), `<img>` absoluto
  com transform translate/scale/rotate sobre vídeo, touch handlers
  (1 dedo = drag, 2 dedos = pinch + rotate), slider de opacidade
  (10-100%), botão Capturar que composita vídeo + imagem num canvas
  e baixa PNG. Botão "🪄 Projetar na parede" em cada card da
  biblioteca abre o overlay. Migration em
  `/migrations/2026-06-10-art-references.sql` (versão atualizada sem
  INSERT INTO storage.buckets — bucket criado via UI). SQL rodado em
  6 blocos separados pra contornar erro 42601 com `text[] NOT NULL
  DEFAULT '{}'` em alguns editores Supabase managed; default usado foi
  `ARRAY[]::text[]`.
- **SQL Wave 27 (2026-06-10) — RLS hardening pós LAUNCH_AUDIT — JÁ
  EXECUTADO no Supabase.** Fecha os 4 blockers críticos B2-B5 do
  `LAUNCH_AUDIT.md`:
  (B2) `orders` INSERT/UPDATE com `auth.uid()=user_id` no WITH CHECK
  (antes era `WITH CHECK (true)` — user A podia criar order pra B);
  (B3) `messages` ganha UPDATE policy (sender/receiver), SELECT filtra
  `deleted_at IS NULL` (admin via `is_portal_admin()` ainda enxerga);
  (B4) `quotes` SELECT restrito a `client_id` + `painter_id` + admin
  (antes USING `true` expunha phone/address de leads — LGPD);
  (B5) storage `posts` + `avatars` com path validation
  `split_part(name, '/', 1) = auth.uid()::text` (antes qualquer auth
  user podia escrever em qualquer path — path traversal). Path pattern
  `{userId}/...` já era seguido por todos uploads no Next. Migration
  em `/migrations/2026-06-10-wave-27-rls-hardening.sql`. Idempotente.
- **SQL Wave 28 (2026-06-10) — pg_cron pros cleanups — JÁ EXECUTADO no
  Supabase.** Agenda automática das 3 funções de limpeza criadas em
  waves anteriores: `cleanup_old_audit_log()` diário 03:00 UTC,
  `cleanup_soft_deleted()` diário 03:30 UTC, `cleanup_orphan_media()`
  (scan, não execute) semanal domingo 04:00 UTC. Migration em
  `/migrations/2026-06-10-cron-cleanups.sql`. `cron.schedule` é
  idempotente (substitui job de mesmo nome). Inspecionar com
  `SELECT * FROM cron.job`.
- **SQL Waves 29/32/33 (2026-06-12) — JÁ EXECUTADAS no Supabase.** Pacote
  de hardening pré-produção rodado de uma vez:
  - **Wave 29 (CSAM, C4)**: `posts.media_hash` + tabelas
    `media_hash_blocklist` + `media_review_queue` (RLS admin-only via
    `is_portal_admin()`). `/migrations/2026-06-11-csam-media-hash.sql`.
    Falta o Cloudflare CSAM Scanning Tool — **opt-in legal manual**
    (email `cloudflare-csam@cloudflare.com` + NCMEC Agreement), NÃO é
    toggle de painel.
  - **Wave 32 (R-H7)**: `profiles_public` recriada SEM `portal_access`
    (não vazar identidade de admin pra spear-phishing). **A view foi
    rodada SEM as colunas `palette`/`country`** (não existem na tabela
    real) — o arquivo no repo foi corrigido pra refletir isso.
    `/migrations/2026-06-12-profiles-public-hide-admin.sql`.
  - **Wave 33 (R-H8)**: UPDATE policy `"art-refs owner update"` no bucket
    `art-refs` com path enforcement `split_part(name,'/',1)=auth.uid()`.
    `/migrations/2026-06-12-art-refs-update-policy.sql`.
- **QA fixes de produção (2026-06-12) — 2 SQLs JÁ EXECUTADOS.** Pacote de 8
  bugs do QA (BUG-01..07 + UX-04); 6 são código puro, 2 dependiam de SQL:
  - **BUG-02 (busca)**: `profiles.search_vector` recriada incluindo
    `profession` (peso A) + `specialties` (peso B) — buscar "pintor"/
    "grafiteiro"/"textura" agora casa. `search_all` inalterada.
    `/migrations/2026-06-12-search-include-profession.sql`. ✓ Live.
  - **BUG-04 (filtros de feed)**: signup grava `user_type` mas `get_feed_v2`
    filtra por `role` (ficava NULL → filtro vazio). Backfill
    `role ← user_type` + trigger `trg_sync_role_from_user_type` BEFORE
    INSERT/UPDATE (só preenche role vazio, nunca sobrescreve 'admin').
    `/migrations/2026-06-12-role-from-user-type.sql`. ✓ Live. Efeito
    colateral bom: badges de role + chat + suggestions também passam a ver
    a categoria de quem se cadastrou pelo fluxo novo.
- **LAUNCH_AUDIT.md** (na raiz do repo) — auditoria de
  production-readiness via 6 sub-auditorias paralelas. 5 blockers
  iniciais: B1 (vanilla legado) **EM ANDAMENTO** (ports `/avaliar` +
  Maquininha entregues, killswitch SW deployado, delete dos 122
  arquivos pendente); B2-B5 (RLS) **RESOLVIDOS via Wave 27**. Médios
  M6 (Seu Zé visibility), M7 (`/alice` role gate), M8 (ESLint dep
  corruption) **RESOLVIDOS**. Restantes M1-M5+M9-M10: ver audit.
- **SQL Wave 21 (2026-06-09) — plataforma social (S2/S6/S7/S8) — JÁ
  EXECUTADO no Supabase.** Tabela `blocks(blocker_id, blocked_id)` com
  UNIQUE, CHECK (blocker <> blocked), índices em ambas colunas, RLS
  owner-only (SELECT/INSERT/DELETE só pra blocker = auth.uid()). RPC
  `list_blocked_ids()` retorna uuid[] do user logado (cliente filtra
  feed/notif sem N+1). RPC `get_feed_v2` recriada incluindo filtro
  `NOT EXISTS (SELECT 1 FROM blocks WHERE blocker_id=p_user_id AND
  blocked_id=p.user_id)`. RPC nova `suggest_to_follow(limit)` retorna
  top pintores não-seguidos (exclui blocked, admin, portal_access),
  ordenando por mesma cidade > mesma UF > rating_avg > review_count >
  created_at. Frontend: serviços `blocks.ts` + `suggestions.ts`, hooks
  `useBlockedList/useBlockedIds/useBlockMutations`, componente
  `<SuggestionsList>` (renderizado no FeedView quando `posts.length=0`
  estilo IG primeira sessão), tela `/perfil/bloqueados`, item no
  ProfileFooter linkando, "Bloquear usuário" no menu opts do PostCard,
  `fetchFeed` legacy também filtra client-side via `listBlockedIds()`
  (defesa em profundidade). Parser `renderRichText(text)` em
  `lib/utils/richText.tsx` transforma `@user` em link `/perfil/<tag>`,
  `#hashtag` em link `/hashtag/<tag>`, e URLs em `<a target=_blank>`.
  Aplicado em PostCard caption + comments. Página `/hashtag/[tag]`
  (RSC + client `HashtagFeed`) lista posts via ILIKE `'%#tag%'` em
  caption — adequado pra volume médio; quando virar gargalo, adicionar
  índice GIN trigram. Migration em `/migrations/2026-06-09-blocks.sql`.
- **SQL Wave 20 (2026-06-09) — quick wins sociais (S1/S4/S5) — JÁ
  EXECUTADO no Supabase.** Adiciona `profiles.verified` (boolean, S1),
  `profiles.instagram_url` + `profiles.website_url` (text, S4),
  `posts.link_url` (text, S5). View `profiles_public` recriada
  incluindo instagram_url + website_url (públicos por design).
  Trigger `protect_profile_columns` revisado pra também impedir
  escalada de `verified=true` por usuário comum (admin-only via
  is_portal_admin). Frontend: PostCard + ProfileHeader mostram badge
  ✓ azul pra `verified || is_pro` (backward compat); EditProfileForm
  ganhou inputs Instagram + Site; ProfileHeader renderiza ícones IG+Site
  no header dark quando preenchidos (normaliza `@user` pra URL completa
  de IG); Composer mostra input "Link 'ver mais'" só em postType='story'
  e grava em `posts.link_url`; StoryViewer renderiza CTA "Ver mais"
  flutuante quando story tem `link_url`. S3 (editar caption) já estava
  implementado em `PostCard.tsx` (modal editOpen + service
  `updatePostCaption`) — item BACKLOG obsoleto. Migration em
  `/migrations/2026-06-09-social-quick-wins.sql`.

