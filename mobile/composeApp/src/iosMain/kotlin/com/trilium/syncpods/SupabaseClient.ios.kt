package com.trilium.syncpods

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.compose.auth.ComposeAuth
import io.github.jan.supabase.compose.auth.googleNativeLogin
import platform.Foundation.NSBundle

actual fun createSupabaseClient(): SupabaseClient = createSupabaseClient(
    supabaseUrl = NSBundle.mainBundle.objectForInfoDictionaryKey("SUPABASE_URL") as? String ?: "",
    supabaseKey = NSBundle.mainBundle.objectForInfoDictionaryKey("SUPABASE_ANON_KEY") as? String ?: ""
) {
    install(Postgrest)
    install(Auth)
    install(Realtime)
    install(ComposeAuth) {
        googleNativeLogin(
            serverClientId = NSBundle.mainBundle.objectForInfoDictionaryKey("GOOGLE_WEB_CLIENT_ID") as? String ?: ""
        )
    }
}
