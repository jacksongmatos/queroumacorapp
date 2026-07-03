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
  webDir: 'next-app/.next/static',
  server: {
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'queroumacor.com.br',
      '*.queroumacor.com.br',
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
};

export default config;
