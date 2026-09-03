# Fronteira nativa — `next-app/lib/native/`

Decisão (2026-09-03, pós-auditoria de arquitetura): a casca mobile continua
**Capacitor** (não React Native) — o app web é o produto; o nativo entra como
capacidades (câmera, push, OAuth via browser do sistema, share), nunca como
segunda UI. RN+Expo fica arquivado como opção futura, reaberta apenas se o
roadmap pedir telas nativas de verdade.

## Regras do contrato

1. **Componentes/hooks importam SÓ `@/lib/native`** (objeto `native`). Nunca
   `@capacitor/*` nem `window.Capacitor` direto. Lint futuro deve travar isso.
2. **O bundle web não carrega dependência nativa.** A casca injeta
   `window.Capacitor` (site vem de `server.url`); `lib/native/platform.ts`
   acessa por esse global. Plugin ausente = feature-detection falha =
   fallback web. A MESMA página serve browser, PWA, casca velha e casca nova.
3. **Toda espera tem timeout** (lição do WebView: promessa pendurada não
   rejeita). OAuth: 5 min; registro de push: 15 s.
4. **Cancelamento ≠ indisponível.** `takePhotoNative` distingue
   `cancelled` (usuário desistiu no prompt nativo → NÃO abrir fallback web)
   de `unavailable` (sem plugin → fallback web).
5. Se a casca um dia virar RN/Expo, **reimplementa-se só este diretório** —
   o resto do app não muda.

## OAuth nativo (fluxo A) — como funciona

`lib/native/auth.ts`: `signInWithOAuth({ skipBrowserRedirect: true })` gera a
URL → `Browser.open()` (Custom Tab / ASWebAuthenticationSession) → login no
domínio do Supabase num browser REAL (sem `disallowed_useragent`) → Supabase
redireciona pro deep link `br.com.queroumacor.app://auth/callback` → plugin
App dispara `appUrlOpen` na WebView → parse do fragment (fluxo implicit) →
`setSession()` → `/completar-perfil`. Integrado no `AuthProvider` com
feature-detection; browser/PWA seguem no fluxo web intocado.

## Pendências pra ativar de verdade (lado da casca / painel)

- [ ] **Supabase → Auth → URL Configuration**: `br.com.queroumacor.app://auth/callback`
      já está nas Redirect URLs (2026-09-03). ATENÇÃO ao esquema no Android:
      o applicationId do Play é `br.com.queroumacor` (SEM `.app`), então o
      intent-filter do deep link na casca Android tem que registrar
      explicitamente o esquema `br.com.queroumacor.app` (o que `auth.ts`
      usa) — NÃO deixar o Capacitor derivar do package, senão o callback
      vira `br.com.queroumacor://auth/callback` e não bate. Se optar por
      derivar, adicionar `br.com.queroumacor://auth/callback` como 2ª
      Redirect URL e ajustar `NATIVE_OAUTH_REDIRECT`. iOS já está certo
      (scheme = bundle `br.com.queroumacor.app`).
- [x] Deps dos plugins já no `package.json` da raiz (`@capacitor/browser`,
      `app`, `camera`, `share`, `push-notifications`, `@capacitor/android`).
      Falta rodar na MÁQUINA DE BUILD (precisa de Android SDK/Xcode, não roda
      no CI/remoto): `npm install` → `npx cap add android` → `npx cap sync`.
- [x] Envio FCM server-side FEITO em código (`lib/api/_services/fcm.ts`,
      canal nativo do `/api/push-notify`). Falta a config (abaixo).

## Push nativo — o que falta ligar (config, não código)

O código do envio está pronto: `/api/push-notify` manda pros DOIS canais —
Web Push (VAPID, quem já existia) e FCM/APNs (novo, `fcm.ts`), cada um
independente do outro. Pra o canal nativo sair do papel:

1. **Firebase**: criar/usar um projeto Firebase, adicionar o app Android
   (package `br.com.queroumacor`) e iOS (bundle `br.com.queroumacor.app`),
   baixar `google-services.json` (Android) / `GoogleService-Info.plist`
   (iOS) e colocá-los no projeto nativo após `cap add`. Gerar uma **service
   account** (Configurações → Contas de serviço → Gerar nova chave privada).
2. **3 envs no CF Pages (Secret)**, do JSON da service account:
   `FCM_PROJECT_ID` (`project_id`), `FCM_CLIENT_EMAIL` (`client_email`),
   `FCM_PRIVATE_KEY` (`private_key` — cola com os `\n` literais; o `fcm.ts`
   normaliza). Sem elas, o canal nativo fica inerte e o web push segue
   funcionando (nenhum 503 novo).
3. **iOS**: subir a APNs Auth Key (.p8) no Firebase (Cloud Messaging), pra
   ele falar com a Apple.

Teste ponta a ponta: com as envs setadas, um POST em `/api/push-notify`
(header `x-internal-secret`) responde `{"native":{"sent":N,...}}`.

## Android — intent-filter do deep link do OAuth (após `cap add android`)

O `cap add android` gera `android/app/src/main/AndroidManifest.xml`. Como o
`applicationId` é `br.com.queroumacor` mas o esquema do callback é
`br.com.queroumacor.app` (o que `lib/native/auth.ts` usa), o intent-filter
tem que declarar o esquema EXPLICITAMENTE dentro da `<activity>` principal:

```xml
<intent-filter android:autoVerify="false">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="br.com.queroumacor.app" android:host="auth" />
</intent-filter>
```

(Alternativa sem editar manifest: usar o esquema derivado do package
`br.com.queroumacor://auth/callback` e adicionar essa 2ª URL nas Redirect
URLs do Supabase + trocar `NATIVE_OAUTH_REDIRECT` — os dois caminhos
funcionam, escolha um.)
- [ ] Fluxo B (SDKs nativos + `signInWithIdToken`, one-tap): exige client
      OAuth por plataforma (iOS client ID; Android com SHA-256 do keystore) —
      fazer junto da unificação de applicationId (achado C4 da auditoria).

## Testes

`__tests__/native.test.ts` trava: fallback total fora da casca (nunca throw),
detecção por plataforma, cancelamento de câmera, e o parser do deep link de
OAuth (`parseAuthCallbackUrl`).
