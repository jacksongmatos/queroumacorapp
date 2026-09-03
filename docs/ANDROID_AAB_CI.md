# Gerar o AAB do Capacitor pelo GitHub Actions (opção B)

O app **definitivo** sai do **Capacitor**, não do WebIntoApp (WebView pura, sem
push/câmera/OAuth nativo). Este workflow compila e **assina** o AAB no CI, sem
precisar de Android Studio na sua máquina. Arquivo:
`.github/workflows/android-aab.yml`.

## 1. Secrets no GitHub (uma vez)

`Settings → Secrets and variables → Actions → New repository secret`. Rode os
comandos numa máquina que tenha o keystore e o `google-services.json`:

| Secret | Como gerar o valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 my-release-key.jks` (macOS: `base64 -i my-release-key.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | a senha do **keystore** (store) |
| `ANDROID_KEY_ALIAS` | o **alias** da chave (o mesmo que assina o app hoje no Play) |
| `ANDROID_KEY_PASSWORD` | a senha da **chave** (às vezes igual à do store) |
| `GOOGLE_SERVICES_JSON_BASE64` | `base64 -w0 google-services.json` — **opcional**; sem ele o AAB compila, mas o push FCM não registra token no aparelho |

> O `.jks` e as senhas **nunca** entram no repositório — só existem como secret
> e são materializados dentro da run (que é efêmera e apagada no fim).
>
> **Use o MESMO keystore/alias que assina o app atual no Play** (`my-release-key.jks`,
> que já confere com a upload key). Se assinar com outro, o Play rejeita o upload.

Na dúvida sobre alias/senha do keystore existente:
```
keytool -list -v -keystore my-release-key.jks
```

## 2. Disparar o build

`Actions → Android AAB (Capacitor) → Run workflow`. Dois campos opcionais:
- **versionName** (ex.: `1.3`) — vazio usa o do `build.gradle` (hoje `1.2`)
- **versionCode** (ex.: `10300`) — vazio usa o do `build.gradle` (hoje `10200`)

> **Regra do Play:** cada upload precisa de um `versionCode` MAIOR que o
> anterior. O build atual do Play é `10100`; o repo está em `10200`. No 2º AAB
> em diante, suba o número (10300, 10400, …) pelo campo `versionCode`.

## 3. Baixar e publicar

Ao terminar (~5-10 min), a run tem um artifact **`queroumacor-release-aab`**.
Baixe, descompacte e suba o `.aab` na **Play Console → Internal Testing**
(comece sempre pela faixa de teste, nunca direto em produção).

## O que o workflow faz por baixo

1. `npm ci` na raiz (Capacitor CLI + plugins) + JDK 17 + Android SDK.
2. Placeholder de `webDir` (o app carrega de `server.url`, o bundle local é
   irrelevante) e `npx cap sync android` — gera o `capacitor.config.json` nos
   assets, que carrega `https://www.queroumacor.com.br`.
3. Decodifica `google-services.json` (se o secret existir) e o keystore.
4. Aplica versionName/versionCode se informados.
5. `./gradlew bundleRelease` — AAB **assinado** com o keystore.
6. Apaga os segredos materializados e publica o `.aab` como artifact.

## Primeira validação recomendada (antes de publicar)

Depois do `google-services.json` no Firebase e das 3 envs FCM no CF Pages, teste
a config de push **sem precisar do AAB** (ver `docs/NATIVE_BRIDGE.md`):
```
curl -X POST https://www.queroumacor.com.br/api/push-notify \
  -H "x-internal-secret: <PUSH_INTERNAL_SECRET>" \
  -H "content-type: application/json" -d '{"diagnose":"fcm"}'
```
`configured:true` = pode gerar o AAB com confiança de que o push vai funcionar.

## Lembrete da transição WebIntoApp → Capacitor

Publicar o AAB do Capacitor é **um app novo na mesma ficha do Play**. Os
usuários atuais seguem no envelope WebIntoApp até **atualizarem** pro AAB do
Capacitor. Só no aparelho já atualizado é que push nativo, câmera nativa e OAuth
pelo browser do sistema passam a existir. Por isso: Internal Testing primeiro,
validar no seu aparelho, depois promover pra produção.
