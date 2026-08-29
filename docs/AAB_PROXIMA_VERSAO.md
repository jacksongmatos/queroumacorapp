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
Última revisão: 2026-08-29.

---

## 1. Opções pra procurar no painel do WebIntoApp

### 1.1 Upload de arquivo / câmera — `onShowFileChooser` 🔴 URGENTE

Sem isso a WebView **não abre a galeria**: tocar em "Trocar foto" (perfil)
ou "Selecionar foto" (publicar/portfólio) não faz absolutamente nada — sem
erro, sem log.

- Bloqueia hoje um pintor real (Bruno Valentim): sem foto de perfil e sem
  portfólio desde o cadastro.
- Confirmado em campo em 29/08: o aviso do paliativo
  (`lib/utils/filePickerWatch.ts`) disparou na tela dele. Ele só aparece
  quando a página **não perde o foco**, ou seja, quando o seletor de fato
  não abriu.
- Precisa também das **permissões de mídia**. Se o app mirar Android 13+
  (API 33), a permissão é `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` — a
  antiga `READ_EXTERNAL_STORAGE` não vale mais. É a explicação mais
  provável pra um Android abrir a galeria e outro não com o mesmo APK.
- Procurar no painel por: *File upload*, *Camera access*, *Gallery*,
  *Permissions*.
- **Se o painel não oferecer:** não há alternativa web. O paliativo atual
  (mandar a pessoa usar o navegador) vira permanente, e o app fica sem
  foto de perfil e sem portfólio. Nesse caso, abrir chamado com o
  WebIntoApp — é funcionalidade básica de WebView.

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
- [ ] Remover o ping de diagnóstico `scrollpin-diag`
      (`lib/hooks/useAndroidWebViewScrollPin.ts`) — era temporário, pra
      descobrir se o AAB entrava no gate. Já respondeu: não entra.
- [ ] Os `assetlinks.json` do repo estão com placeholders
      (`package_name: br.com.queroumacor` e um SHA-256 falso). Só importam
      no caminho TWA/Bubblewrap, que **não é o nosso** — ou corrigir com
      os dados reais do WebIntoApp, ou remover pra não confundir a próxima
      pessoa.

---

## Prioridade

Se só der pra fazer uma coisa: **1.1**. É o que está travando usuário de
verdade hoje. **1.2** e **1.3** saem de graça na mesma regeração.
