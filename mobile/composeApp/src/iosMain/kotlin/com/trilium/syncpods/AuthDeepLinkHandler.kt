package com.trilium.syncpods

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

private var deepLinkClient: SupabaseClient? = null

fun initAuthDeepLinkHandler(client: SupabaseClient) {
    deepLinkClient = client
}

fun handleAuthDeepLink(urlString: String) {
    val client = deepLinkClient ?: return
    val code = urlString.substringAfter("code=", "").substringBefore("&")
    if (code.isBlank()) return
    GlobalScope.launch {
        try {
            client.auth.exchangeCodeForSession(code)
        } catch (_: Exception) {}
    }
}
