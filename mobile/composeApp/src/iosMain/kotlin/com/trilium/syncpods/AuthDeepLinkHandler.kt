package com.trilium.syncpods

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.handleDeeplinks
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import platform.Foundation.NSURL

private var deepLinkClient: SupabaseClient? = null

fun initAuthDeepLinkHandler(client: SupabaseClient) {
    deepLinkClient = client
}

fun handleAuthDeepLink(urlString: String) {
    val client = deepLinkClient ?: return
    val nsUrl = NSURL(string = urlString) ?: return
    GlobalScope.launch {
        try {
            client.handleDeeplinks(nsUrl)
        } catch (_: Exception) {}
    }
}
