//
//  AppDelegate.swift
//  App
//
//  Capacitor 6 boilerplate for br.com.queroumacor.app com registro no
//  Apple Push Notification service (APNs).
//
//  O plugin instalado e `@capacitor-firebase/messaging` (o mesmo do
//  Android), NAO o `@capacitor/push-notifications` — o Firebase faz a
//  ponte FCM -> APNs e devolve o token no evento `tokenReceived`. Os
//  callbacks de APNs abaixo continuam necessarios: eles sao da Capacitor
//  core (`capacitorDidRegisterForRemoteNotifications`), nao do plugin.
//
//  NAO chame `FirebaseApp.configure()` aqui: o proprio plugin ja faz
//  isso quando e instanciado (`FirebaseMessaging.init`, com guarda
//  `if FirebaseApp.app() == nil`). Importar FirebaseCore no target do app
//  so criaria dependencia direta de um pod transitivo, sem ganho.
//
//  O que o Firebase EXIGE e o `GoogleService-Info.plist` dentro do
//  bundle — sem ele o `configure()` do plugin derruba o app no boot. A
//  build do Codemagic escreve esse arquivo a partir da variavel
//  GOOGLE_SERVICE_INFO_PLIST (base64, grupo `firebase`); ele nao fica
//  versionado, mesma convencao do `google-services.json` do Android.
//

import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions:
            [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Request notification permission early so the user sees the
        // prompt once they reach the screen that actually needs it.
        // The JS side (via the PushNotifications plugin) controls
        // when `register()` is called; here we just install the
        // delegate so foreground presentation works.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // NAO reintroduzir os metodos de UISceneSession aqui.
    //
    // Este AppDelegate declarava `application(_:configurationForConnecting:options:)`
    // e `didDiscardSceneSessions`. Quando o AppDelegate declara suporte a scenes, o
    // UIKit passa a usar o ciclo de vida de scenes e ignora o caminho legado que
    // cria a janela a partir de `UIMainStoryboardFile`. Como o Info.plist nao tem
    // `UIApplicationSceneManifest` e o projeto nao tem SceneDelegate, a scene subia
    // sem delegate e sem storyboard: nenhuma janela era criada, nada era desenhado,
    // e o app NAO crashava — tela preta permanente, sem log de crash.
    //
    // O template do Capacitor 6 nao tem esses metodos. O app carrega o
    // CAPBridgeViewController pelo Main.storyboard via UIMainStoryboardFile, no
    // ciclo de vida classico com `var window: UIWindow?`.
    //
    // Sintoma no iOS apenas: no Android nao existe esse conceito, por isso a mesma
    // build do Capacitor abria normalmente no Android.

    // MARK: Deep links / Universal Links

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey : Any] = [:]
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            app, open: url, options: options
        )
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }

    // MARK: APNs registration callbacks
    //
    // These two callbacks are required by the
    // @capacitor/push-notifications plugin. When iOS finishes APNs
    // registration, the plugin emits the `registration` JS event with
    // the hex-encoded device token. The JS side persists the token to
    // Supabase so the server can target the device.

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
}

// MARK: - Foreground notification presentation

extension AppDelegate: UNUserNotificationCenterDelegate {

    // Show banner + sound when a push arrives while the app is open.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler:
            @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    // Forward tap actions to Capacitor so the plugin can emit
    // `pushNotificationActionPerformed` to JS.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        NotificationCenter.default.post(
            name: Notification.Name("pushNotificationActionPerformed"),
            object: response
        )
        completionHandler()
    }
}
