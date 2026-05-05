package com.trilium.syncpods

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.handleDeeplinks
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import platform.Foundation.NSURL
import com.trilium.syncpods.deeplink.PendingDeepLink
import com.trilium.syncpods.deeplink.parsePlaylistDeepLink
import org.koin.core.context.GlobalContext

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

fun handleDeepLink(urlString: String) {
    val route = parsePlaylistDeepLink(urlString)
    if (route != null) {
        GlobalContext.get().get<PendingDeepLink>().set(route)
        return
    }
    val client = deepLinkClient ?: return
    val nsUrl = NSURL(string = urlString) ?: return
    GlobalScope.launch {
        try { client.handleDeeplinks(nsUrl) } catch (_: Exception) {}
    }
}
