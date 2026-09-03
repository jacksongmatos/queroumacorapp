# Gerar o AAB do Capacitor pelo Codemagic (opção B)

O app **definitivo** sai do **Capacitor**, não do WebIntoApp (WebView pura, sem
push/câmera/OAuth nativo). O Codemagic compila e **assina** o AAB na nuvem, sem
Android Studio local — e depois cobre o iOS no mesmo lugar. Arquivo:
`codemagic.yaml` (raiz).

## 1. Setup no painel (uma vez)

Tudo no [codemagic.io](https://codemagic.io) — **não** em secret do GitHub.

1. **Conectar o repositório**: Add application → GitHub → `queroumacor-max/queroumacorapp`.
   O Codemagic detecta o `codemagic.yaml` sozinho.
2. **Keystore de assinatura**: `Teams/App settings → Code signing identities →
   Android keystores → Add keystore`:
   - subir `my-release-key.jks` (**o MESMO que assina o app no Play** — se usar
     outro, o Play rejeita o upload)
   - **Reference name**: `queroumacor_keystore` (tem que bater com o `codemagic.yaml`)
   - preencher **alias**, **keystore password** e **key password**

   Isso injeta na build: `CM_KEYSTORE_PATH`, `CM_KEYSTORE_PASSWORD`,
   `CM_KEY_ALIAS`, `CM_KEY_PASSWORD` — que o workflow usa pra montar o
   `android/key.properties` que o `build.gradle` lê.
3. **Firebase (opcional, pro push)**: `Environment variables`:
   - **Variable name**: `GOOGLE_SERVICES_JSON`
   - **Value**: `base64 -w0 google-services.json` (macOS: `base64 -i google-services.json`)
   - **Group**: `firebase` · marcar **Secure**

   Sem essa variável o AAB compila, mas o push FCM não registra token no aparelho.

## 2. Disparar o build

`App → Start new build → workflow "Android AAB (Capacitor)" → Start`.
(Não roda a cada push de propósito — só na mão.)

## 3. Receber o AAB

Ao terminar (~5-10 min), o Codemagic **manda o `.aab` por e-mail** pra
`jackson.guerra@gmail.com` (e ele fica nos artifacts da build). Suba na
**Play Console → Internal Testing** (sempre a faixa de teste primeiro).

> **Regra do Play:** cada upload precisa de `versionCode` MAIOR que o anterior.
> Play atual = `10100`; repo = `10200`. Do 2º AAB em diante, suba o número em
> `android/app/build.gradle` (`versionCode`/`versionName`) e commite.

## O que o workflow faz

1. `npm ci` (Capacitor CLI + plugins) — Node 20, JDK 17.
2. Placeholder de `webDir` + `npx cap sync android` → gera o
   `capacitor.config.json` nos assets, que carrega `https://www.queroumacor.com.br`.
3. Decodifica `GOOGLE_SERVICES_JSON` (se houver).
4. Monta `android/key.properties` do keystore do painel.
5. `./gradlew bundleRelease` → AAB **assinado**.
6. Publica o `.aab` (e-mail + artifacts).

## Validar o push ANTES de publicar

Depois do `google-services.json` no Firebase e das 3 envs FCM no CF Pages, dá
pra testar a config **sem AAB** (ver `docs/NATIVE_BRIDGE.md`):
```
curl -X POST https://www.queroumacor.com.br/api/push-notify \
  -H "x-internal-secret: <PUSH_INTERNAL_SECRET>" \
  -H "content-type: application/json" -d '{"diagnose":"fcm"}'
```
`configured:true` = pode gerar o AAB.

## Transição WebIntoApp → Capacitor

O AAB do Capacitor é **um app novo na mesma ficha do Play**. Os usuários atuais
seguem no envelope WebIntoApp até **atualizarem**. Só no aparelho já atualizado
é que push nativo, câmera nativa e OAuth pelo browser do sistema passam a
existir. Por isso: Internal Testing → validar no seu aparelho → produção.

## iOS (próximo passo, quando for a hora)

O mesmo `codemagic.yaml` ganha um workflow `ios-release`: instância macOS,
`cap sync ios`, `xcode-project build-ipa`, assinatura via **Apple Developer
Portal integration** (certificado + provisioning gerenciados pelo Codemagic) e
publicação no **TestFlight**. Exige, no painel: App Store Connect API key, o
bundle `br.com.queroumacor.app` e a APNs Auth Key no Firebase. Fazemos quando
você quiser abrir a frente iOS.
