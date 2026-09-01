# Próxima versão do AAB — o que entra

Lista de corte do próximo build Android. Tudo aqui **só chega no aparelho
com um app novo publicado** — deploy web não resolve nenhum destes.

> **O caminho é um só: código no GitHub → Cloudflare Pages → WebIntoApp
> empacota o site num AAB.** Não existe build nativo neste projeto.
> Capacitor, Bubblewrap/TWA e plugins nativos estão fora de escopo — o
> `capacitor.config.ts` e o `docs/IOS_BUILD.md` são restos de uma direção
> abandonada. Cada limitação de WebView se resolve por uma opção do painel
> do WebIntoApp ou por uma alternativa web; quando não houver nenhuma das
> duas, está escrito aqui o que fica de fora.

Contexto técnico: `docs/ANDROID_BUILD.md`.
Última revisão: 2026-09-01.

---

## 0. PRAZO DA PLAY STORE: target API 36 até 1º de novembro ⏰

O Play Console abriu aviso de política: **"App must target Android 16 (API
level 36) or higher"**, com *Action by Nov 1* e prorrogação já concedida.
Hoje o app está em **API 35**. Passado o prazo, o Google **não aceita mais
atualização nenhuma** — o app continua na loja, mas congelado.

Isso não é código nosso: **quem define o target SDK é o WebIntoApp**, na
hora de gerar o AAB. Então a primeira pergunta, antes de qualquer opção de
painel, é:

> **O WebIntoApp já gera com targetSdk 36?**

- **Se sim:** regerar resolve, e é a hora de marcar tudo da seção 1 de uma
  vez.
- **Se não:** abrir chamado com eles AGORA. Sem targetSdk 36 não há
  atualização depois de 1º/11 — inclusive a que destrava a galeria.

### Efeito colateral do target novo: tela de borda a borda

Do targetSdk 35 em diante o Android desenha o app **de borda a borda** por
padrão: a WebView passa por baixo da barra de status e da barra de
navegação. O app inteiro já reservava espaço com `env(safe-area-inset-*)`
(TopNav, BottomNav, AppShell, bottom sheets, toasts), mas no Android esses
valores voltam **zero** enquanto a página não declara `viewport-fit:
cover` — ou seja, a reserva estava no código e não valia nada.

Corrigido pelo lado web em 29/08 (`viewport` do `app/layout.tsx`). Como o
app já está em API 35, isso provavelmente **já afetava** aparelhos com
Android 15.

**Conferir depois de gerar o AAB novo:** o cabeçalho não pode ficar embaixo
do relógio, e a barra de baixo não pode ficar embaixo dos botões do
sistema.

---

## 1. Opções pra procurar no painel do WebIntoApp

### 1.1 Upload de arquivo — `onShowFileChooser` ✅ RESOLVIDO em 31/08

O AAB publicado em 31/08 (com as permissões marcadas no painel) **abre a
galeria**. Confirmado em campo em 01/09 no aparelho do Bruno: o seletor
aparece e dá pra escolher a foto. O paliativo
(`lib/utils/filePickerWatch.ts` + `GaleriaBloqueadaSheet`) continua no
código como rede de segurança pra quem ainda não atualizou o app.

Fica registrado o que era, porque explica a forma do problema seguinte:
sem `onShowFileChooser` o toque não fazia **absolutamente nada** — sem
erro, sem log —, e isso travou dois pintores reais (Bruno Valentim e Leo)
desde o cadastro até 30/08.

### 1.1b O app MORRE com a galeria aberta 🔴 URGENTE (novo em 01/09)

Sintoma relatado pelo Bruno: a galeria abre, ele toca na foto e **o app
volta pra tela inicial** — sem a foto, sem a legenda e sem explicação.

Não é permissão e não é o `onShowFileChooser`. É o ciclo de vida da
activity:

1. o seletor de fotos é **outra activity** (Google Fotos / DocumentsUI),
   pesada de memória — carrega milhares de miniaturas;
2. o QueroUmaCor fica em segundo plano e o Android **encerra o processo**
   pra liberar RAM (comportamento normal e documentado do sistema);
3. na volta o wrapper recria a activity, a WebView nasce vazia e carrega a
   **URL inicial** — daí a "tela inicial";
4. o `ValueCallback<Uri[]>` que receberia o arquivo morreu junto, então a
   foto é descartada mesmo quando a tela sobrevive.

**O que pedir ao WebIntoApp:** preservar o `ValueCallback` pendente e o
estado da WebView na recriação da activity
(`onSaveInstanceState` + `WebView.saveState()/restoreState()`), em vez de
recarregar a URL inicial. É um chamado bem mais fácil de descrever que o
anterior — e eles já mostraram que mexem nessa parte do wrapper.

**Paliativo web no ar desde 01/09** (`lib/utils/pickerRecovery.ts`): antes
de abrir o seletor o app grava uma marca em `localStorage` (que sobrevive
à morte do processo) e a apaga em todos os finais normais — arquivo
chegou, pessoa cancelou, seletor não abriu. Sobrou marca num documento
recém-carregado = aquele documento morreu com a escolha pendente. Aí o
app leva a pessoa de volta pra tela onde ela estava
(`components/PickerRecovery.tsx`), diz o que aconteceu e oferece as duas
saídas de sempre. A legenda do composer é gravada no disco **no gesto que
abre o seletor** (o autosave normal é throttled em 5s).

Isso **não recupera o arquivo** — ele morre com o processo, e nenhum
código web muda isso. O que resolve de vez é o item acima, no wrapper. A
saída que funciona hoje é a **câmera**, que roda dentro da própria página
(`getUserMedia`) e por isso é imune: o app nunca sai pra outra activity.

Telemetria: `/admin/errors` recebe `picker-restart` (app morreu com a
galeria aberta) e `picker-fail` (seletor não abriu) — dá pra ver em quais
aparelhos acontece, em vez de descobrir por WhatsApp.

### 1.1c Permissões de mídia — conferir o que o painel gerou

Na tela de permissões do Android (01/09, aparelho do usuário) aparecem
**Câmera, Localização, Microfone e Notificações** — e *nenhuma* entrada de
fotos/mídia. Como o app mira API 35, a leitura mais provável é que o
toggle "Add Storage Permissions" gerou a antiga `READ_EXTERNAL_STORAGE`,
que o Android 13+ **ignora por completo** (por isso nem é listada).

Na prática isso não bloqueia o seletor — o seletor do sistema entrega o
arquivo por Intent e não exige permissão de leitura. Só vale saber que, se
algum dia o app precisar **varrer** a galeria, a permissão certa é
`READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`.

A **câmera** está declarada e concedida, e o Android registrou uso real
("Last accessed") — ou seja, o wrapper implementa `onPermissionRequest` e
a saída de emergência funciona.

**Alternativa web JÁ NO AR desde 30/08 — e ela depende da CÂMERA.** Se a
galeria não abre, o app agora oferece **"📷 Tirar foto agora"**
(`components/CameraCapture.tsx`): `getUserMedia` + canvas produzem o
arquivo na mão, sem passar pelo seletor. O botão também aparece direto ao
lado de "Trocar foto" e do dropzone de publicar, em qualquer celular.

Só que a câmera na WebView tem a **mesma natureza de dependência**: o
wrapper precisa responder ao `WebChromeClient.onPermissionRequest`
(`PermissionRequest.VIDEO_CAPTURE`) e declarar `android.permission.CAMERA`.
Então, no painel:

- **"Camera access" / "Camera permission" é a opção mais importante depois
  do file upload** — é o que faz a saída de emergência funcionar sem AAB
  novo a cada tropeço.
- Falha de câmera **é visível** (a promessa rejeita) e chega no
  `/admin/errors` como `camera-fail`; a da galeria é silêncio puro. Se os
  dois falharem no aparelho do pintor, sobra o botão "🌐 Abrir no
  navegador", que sai pro Chrome por URL `intent:`.
- **Se o painel não oferecer nem upload nem câmera:** abrir chamado com o
  WebIntoApp — é funcionalidade básica de WebView; o app fica dependendo do
  Chrome pra qualquer foto.

### 1.2 Desmarcar "Pull to Refresh"

Vem ligado por padrão. O app é um shell `100dvh` com `overflow:hidden` —
quem rola é o `<main>`, então pro nativo o documento está sempre no topo e
o gesto de recarregar fica armado **na tela inteira**: arrasto rápido pra
baixo recarrega em qualquer posição.

Paliativo no ar desde 28/08 (`useAndroidWebViewScrollPin` pina o documento
em `scrollY = 2`), que já cobre o caso. Desmarcar é a correção de raiz.

### 1.3 Customizar o user agent

Acrescentar um token fixo, por exemplo `QueroUmaCorApp/1`.

O UA do wrapper hoje **não traz `wv` nem o nome dele** — os pings de
diagnóstico chegaram todos com `wv=false`. Isso já causou dois bugs em
agosto:

- o pin de scroll ficou mudo no app (gate largado depois pra `/Android/i`);
- o compartilhar PDF caiu no caminho de navegador e gerou o "Save As" com
  o campo vazio.

É a mudança mais barata da lista. Também **destrava** decisões que hoje não
dá pra tomar: por exemplo, esconder ou reescrever o botão de login Google
só dentro do app (ver 1.5) — sem o token, mexer nisso quebraria quem usa
Chrome no Android.

Procurar por: *Custom user agent*, *User agent string*, *Advanced*.

### 1.4 Compartilhamento nativo

Se houver opção de expor `navigator.share`, ligar: o compartilhar do
orçamento passa a **anexar o PDF de verdade** em vez de mandar o link.

Procurar por: *Share*, *Web Share API*, *Native sharing*.

**Se não oferecer:** fica como está — o PDF sobe pro Storage e vai o link
pela folha "Enviar orçamento por" (WhatsApp, SMS, e-mail, Telegram,
Facebook, copiar, baixar). Funciona; o cliente toca no link e baixa. Não
há caminho web pra anexar arquivo dentro de WebView.

> Não tentar `intent:` com ACTION_SEND. Testado em 29/08 e revertido: o
> wrapper trata a URL do intent como download, abre o "Save As" com
> milhares de caracteres no nome e **salvar fecha o app**. Nem por iframe
> escapa.

### 1.5 Abrir OAuth no navegador do sistema

O login Google não funciona dentro do app: o Google **bloqueia OAuth em
WebView embarcada** de propósito (`disallowed_useragent`), então ele não
enxerga as contas já logadas no celular. No navegador funciona.

Se o painel tiver algo como *Open external links in browser* ou uma lista
de domínios que abrem fora do app, incluir `accounts.google.com` e
`appleid.apple.com` — é o que resolveria.

**Se não oferecer:** o login social fica sendo só do navegador. Mitigação
web possível (depende de 1.3): dentro do app, trocar o botão por um aviso
em vez de deixar a pessoa bater num erro do Google.

### 1.6 Página offline do wrapper

Sem rede na abertura, o app não tem **nenhuma** tela pra mostrar — tudo
vem da rede. A maioria dos geradores oferece uma tela de "sem conexão"
embutida; procurar por *Offline page*, *No connection screen*.

**Se não oferecer:** o service worker já cobre quem abriu o app pelo menos
uma vez (guarda a última página boa e mostra "Reconectando…" com nova
tentativa automática). Quem instalou e abriu pela primeira vez sem
internet fica sem nada — caso raro, e sem saída pelo lado web.

### 1.7 Notificação com o app fechado

Web Push não existe em WebView. Se o painel oferecer push (muitos
geradores oferecem, via FCM ou OneSignal), avaliar — mas atenção: esse
tipo de push costuma ser **aviso em massa disparado da dashboard deles**,
não "chegou mensagem pro pintor X, avisa só ele", que é o que o app
precisa.

Todo o backend de push já está pronto e validado ponta a ponta; ele só não
tem como ser entregue dentro do wrapper.

**Se não oferecer push por usuário:** o canal de aviso que a loja já tem e
funciona é o **WhatsApp** — a máquina de mensagens, follow-up e IA está no
ar. Para avisos que realmente precisam chegar, é por ali.

---

## 2. Higiene de release

- [ ] Keystore guardada em cofre, com as duas senhas.
- [ ] Bumpar a versão do app no painel (`appVersion` / `appVersionCode`).
- [ ] Notas de versão em pt-BR.
- [x] ~~Remover o ping de diagnóstico `scrollpin-diag`~~ — **feito em
      2026-08-30.** O ping cumpriu a missão: o UA real do wrapper é
      `Dalvik/2.1.0 (Linux; U; Android 16; ...)` (sem `wv`, sem Chrome),
      então o gate largo `/Android/i` pega o app instalado e o pin está
      ativo nele. O filtro `scrollpin-diag` segue no `/admin/errors` só
      pra ler as linhas históricas.
- [ ] Os `assetlinks.json` do repo estão com placeholders
      (`package_name: br.com.queroumacor` e um SHA-256 falso). Só importam
      no caminho TWA/Bubblewrap, que **não é o nosso** — ou corrigir com
      os dados reais do WebIntoApp, ou remover pra não confundir a próxima
      pessoa.

---

## Prioridade

Se só der pra fazer uma coisa: **1.1**. É o que está travando usuário de
verdade hoje. **1.2** e **1.3** saem de graça na mesma regeração.
