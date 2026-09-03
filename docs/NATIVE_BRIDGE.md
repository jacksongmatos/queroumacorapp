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

- [ ] **Supabase → Auth → URL Configuration**: adicionar
      `br.com.queroumacor.app://auth/callback` às Redirect URLs. Sem isso o
      callback cai no Site URL e o app nunca recebe os tokens.
- [ ] Casca: instalar `@capacitor/browser`, `@capacitor/app`,
      `@capacitor/camera`, `@capacitor/share`, `@capacitor/push-notifications`
      e rodar `npx cap sync`. (Scheme iOS já registrado no
      `Info.plist` → `CFBundleURLTypes`; Android: intent-filter do scheme ao
      criar o projeto com `npx cap add android`.)
- [ ] Push servidor: tabela de device tokens + envio FCM/APNs (o
      `registerNativePush` já devolve o token; persistência é o próximo passo).
- [ ] Fluxo B (SDKs nativos + `signInWithIdToken`, one-tap): exige client
      OAuth por plataforma (iOS client ID; Android com SHA-256 do keystore) —
      fazer junto da unificação de applicationId (achado C4 da auditoria).

## Testes

`__tests__/native.test.ts` trava: fallback total fora da casca (nunca throw),
detecção por plataforma, cancelamento de câmera, e o parser do deep link de
OAuth (`parseAuthCallbackUrl`).
