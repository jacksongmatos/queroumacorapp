# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Preserva linha/arquivo pra stack trace de crash em produção (Play Console).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ─── Capacitor + plugins (R8 / minifyEnabled=true) ───────────────────────────
# O Capacitor registra plugins por REFLEXÃO (nome da classe + anotação). Sem
# estas regras o R8 renomeia/remove as classes e o app abre e quebra ("plugin
# not implemented") — some justamente câmera, share, push, browser. Os AARs
# oficiais trazem consumerProguard, mas mantemos explícito como rede de
# segurança (custa alguns KB e evita AAB quebrado).
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
  @com.getcapacitor.annotation.PermissionCallback <methods>;
  @com.getcapacitor.PluginMethod public <methods>;
}
# Plugins @capacitor-firebase/* (namespace io.capawesome) e Firebase.
-keep class io.capawesome.capacitorjs.plugins.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
# JS bridge da WebView (métodos chamados de JS não podem ser removidos).
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}
