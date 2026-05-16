# kotlinx.serialization — keep generated $$serializer companions and @Serializable classes
-keepattributes *Annotation*, InnerClasses
-keep class kotlinx.serialization.** { *; }
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    *** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep class **$$serializer { *; }
-keep @kotlinx.serialization.Serializable class * { *; }

# Supabase Kotlin client
-keep class io.github.jan.supabase.** { *; }
-dontwarn io.github.jan.supabase.**

# Koin
-keep class org.koin.** { *; }
-keepnames class * extends org.koin.core.module.Module

# arch library (com.composure.arch)
-keep class com.composure.arch.** { *; }

# Google Credentials / Sign-In
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }

# Kotlin coroutines (supplement bundled rules)
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}
