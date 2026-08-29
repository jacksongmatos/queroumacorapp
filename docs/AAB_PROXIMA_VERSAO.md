# Próxima versão do AAB — o que entra

Lista de corte do próximo build Android. Tudo aqui **só chega no aparelho
com um app novo publicado** — deploy web não resolve nenhum destes.

Contexto técnico de cada item: `docs/ANDROID_BUILD.md`.
Última revisão: 2026-08-29.

---

## 1. Painel do WebIntoApp (marcar, desmarcar, regerar)

Não precisa de código. São opções do gerador.

### 1.1 Ligar upload de arquivo / câmera — `onShowFileChooser` 🔴 URGENTE

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
  antiga `READ_EXTERNAL_STORAGE` não vale mais. Isso pode explicar por que
  um Android abre a galeria e outro não com o mesmo APK.
- Paliativo no ar: o app avisa e manda a pessoa usar o navegador.

### 1.2 Desmarcar "Pull to Refresh"

Vem ligado por padrão no gerador. O app é um shell `100dvh` com
`overflow:hidden` — quem rola é o `<main>`, então pro nativo o documento
está sempre no topo e o gesto de recarregar fica armado **na tela
inteira**: arrasto rápido pra baixo recarrega em qualquer posição.

Paliativo no ar desde 28/08 (`useAndroidWebViewScrollPin` pina o documento
em `scrollY = 2`), mas a correção de raiz é desmarcar aqui.

### 1.3 Customizar o user agent

Acrescentar um token fixo, por exemplo `QueroUmaCorApp/1`.

O UA do wrapper hoje **não traz `wv` nem o nome dele** — os pings de
diagnóstico chegaram todos com `wv=false`. Isso já causou dois bugs em
agosto:

- o pin de scroll ficou mudo no app (gate largado depois pra `/Android/i`);
- o compartilhar PDF caiu no caminho de navegador e gerou o "Save As" com
  o campo vazio.

É a mudança mais barata da lista e evita a próxima rodada de bugs de
detecção.

### 1.4 Verificar se o painel oferece share nativo

Se houver opção de expor `navigator.share`, ligar **resolve o anexo do PDF
sem build nativo** (item 2.1). Se não houver, o item fica onde está.

---

## 2. Só com build nativo (Capacitor)

O WebIntoApp não resolve estes. Exigem sair do gerador. O repositório já
tem o esqueleto: `capacitor.config.ts`, `docs/IOS_BUILD.md`.

### 2.1 Anexar o PDF de verdade no WhatsApp

Hoje vai o **link** e o cliente baixa tocando nele. Anexar exige entregar
ao Android uma URI `content://`, que código web não produz. Precisa do
plugin Share do Capacitor.

> Não tentar o atalho por `intent:` com ACTION_SEND. Foi testado em
> 29/08 e reverteu: o wrapper trata a URL do intent como download, abre o
> "Save As" com milhares de caracteres no nome e **salvar fecha o app**.
> Nem por iframe escapa.

### 2.2 Notificação com o app fechado

Web Push não existe em WebView — nem Android nem iOS. Todo o backend está
pronto e validado ponta a ponta. Falta push **nativo**: plugin
`@capacitor/push-notifications` + FCM/APNs, tabela de tokens e envio pelo
servidor.

### 2.3 Login Google e Apple

Hoje o OAuth navega a própria WebView pro provedor, e o Google recusa isso
(`disallowed_useragent`). O certo é `@capacitor/browser` + deep link de
callback.

### 2.4 Tela de fallback sem internet

`webDir` aponta pra `next-app/.next/static`, que **não é um build web** —
não tem `index.html`. Sem rede na abertura, o app não tem uma tela sequer
pra mostrar.

---

## 3. Higiene de release

- [ ] Keystore guardada em cofre, com as duas senhas. Considerar Play App
      Signing.
- [ ] Trocar os placeholders do `assetlinks.json` — hoje está com
      `package_name: br.com.queroumacor` (o oficial é
      `com.calicolors.queroumacor`) e um SHA-256 que não corresponde a
      keystore nenhuma. São dois arquivos (raiz e `next-app/public/`) mais
      o `twa-manifest.json`. Só se aplica se o caminho for TWA.
- [ ] Bumpar `appVersion` e `appVersionCode`.
- [ ] Notas de versão em pt-BR.
- [ ] Remover o ping de diagnóstico `scrollpin-diag`
      (`lib/hooks/useAndroidWebViewScrollPin.ts`) — era temporário, pra
      descobrir se o AAB entrava no gate. Já respondeu: não entra.
- [ ] Checklist completo de publicação: `docs/ANDROID_BUILD.md`.

---

## Prioridade

Se só der pra fazer uma coisa: **1.1**. É o que está travando usuário de
verdade hoje. **1.2** e **1.3** vêm de graça na mesma regeração.
