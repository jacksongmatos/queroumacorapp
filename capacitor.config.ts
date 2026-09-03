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
    url: 'https://queroumacor.com.br',
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
  },
};

export default config;
