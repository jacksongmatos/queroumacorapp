import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for QueroUmaCor iOS / Android wrappers.
 * The app bundles the Next.js static export locally.
 * Pre-publish checklist:
 * - Bundle ID `br.com.queroumacor.app` must be registered in
 *   Apple Developer (Identifiers) and Google Play Console.
 * - `npx cap add ios` / `npx cap add android` must be run on a host
 *   with Xcode (iOS) or Android Studio (Android) — the resulting
 *   `ios/` and `android/` boilerplate is committed to the repo.
 * - After `cap add ios`, copy the curated `ios/App/App/Info.plist`
 *   and `ios/App/App/PrivacyInfo.xcprivacy` from THIS repo on top of
 *   the Capacitor-generated stubs.
 * See docs/IOS_BUILD.md for the full step-by-step build flow.
 */
const config: CapacitorConfig = {
  // appId = bundle ID do iOS. NO ANDROID o `applicationId` do Play é
  // `br.com.queroumacor` (SEM `.app`) — o `cap add android` scaffolda o
  // build.gradle a partir deste appId, então DEPOIS de `cap add android` é
  // preciso trocar `applicationId` pra `br.com.queroumacor` no
  // `android/app/build.gradle` (além de versionCode 10200, minSdk 24,
  // compileSdk 36). iOS mantém `br.com.queroumacor.app`.
  appId: 'br.com.queroumacor.app',
  appName: 'QueroUmaCor',
  // ATENÇÃO: `.next/static` NÃO é um web build — não tem `index.html`. Como o
  // app carrega tudo de `server.url`, isso passa despercebido no dia a dia,
  // mas significa que NÃO existe bundle local de fallback: sem rede no
  // momento da abertura, a WebView não tem uma única tela pra mostrar e o
  // usuário só vê o erro de conexão do sistema. Enquanto for assim, o app
  // depende 100% da rede pra abrir.
  webDir: 'next-app/.next/static',
  server: {
    // Canônico é o www (host do deep link / App Links, confirmado 2026-09-03).
    url: 'https://www.queroumacor.com.br',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    // Domínios que a WebView pode navegar/carregar. O que fica de fora é
    // BLOQUEADO no iOS (App-Bound Domains, ver `WKAppBoundDomains` no
    // Info.plist) — e uma requisição bloqueada chega no JS como falha de
    // rede genérica, que o app traduz pra "Sem conexão. Verifique sua
    // internet": o usuário lê "sem internet" com a internet funcionando.
    // Por isso o Supabase (banco + auth + storage, de onde vem TODO o dado
    // do app) precisa estar listado explicitamente.
    allowNavigation: [
      'queroumacor.com.br',
      '*.queroumacor.com.br',
      'uwqebaqweehiljsqkifm.supabase.co',
    ],
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#1a1a2e',
    // Apple App-Bound Domains — restricts WKWebView to listed domains.
    // The actual domain list lives in Info.plist (WKAppBoundDomains).
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    backgroundColor: '#1a1a2e',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // Push nativo via @capacitor-firebase/messaging — devolve token FCM no
    // Android E no iOS (o Firebase faz a ponte FCM→APNs). O token é
    // persistido em `push_device_tokens` (lib/services/pushTokens.ts) e o
    // envio server-side é FCM HTTP v1 (lib/api/_services/fcm.ts).
    // `presentationOptions` controla a notificação em foreground no iOS.
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Splash nativa: a casca segura a tela até o site carregar; o código
    // (lib/native/splash.ts, via NativeChrome) chama hide() com fade assim que
    // o React pinta o shell. `launchAutoHide:false` deixa o hide na mão do app
    // (senão a splash some antes do site aparecer e mostra a tela branca);
    // `launchShowDuration` é só o teto de segurança caso o hide não rode.
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 5000,
      backgroundColor: '#1a1a2e',
      androidSpinnerStyle: 'small',
      showSpinner: false,
    },
    // Teclado: 'native' faz o SO redimensionar a WebView pra área acima do
    // teclado — o layout 100dvh do app se ajusta sem pulo (ver
    // lib/native/keyboard.ts). resizeOnFullScreen evita gap embaixo no Android.
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
