package com.trilium.syncpods

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.annotations.SupabaseInternal
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.network.KtorSupabaseHttpClient
import io.ktor.client.call.HttpClientCall
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.Sender
import io.ktor.client.plugins.plugin
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode

@OptIn(SupabaseInternal::class)
fun SupabaseClient.installJwtRefreshInterceptor(): SupabaseClient {
    val ktorHttpClient = httpClient.httpClient
    ktorHttpClient.plugin(HttpSend).intercept { request ->
        jwtRefreshIntercept(
            request = request,
            onRefresh = { auth.refreshCurrentSession() },
            getToken = { auth.currentSessionOrNull()?.accessToken },
        )
    }
    return this
}

internal suspend fun Sender.jwtRefreshIntercept(
    request: HttpRequestBuilder,
    onRefresh: suspend () -> Unit,
    getToken: suspend () -> String?,
): HttpClientCall {
    val call = execute(request)
    if (call.response.status != HttpStatusCode.Unauthorized) return call
    runCatching { onRefresh() }
    val newToken = getToken()
    if (newToken != null) {
        request.headers.remove(HttpHeaders.Authorization)
        request.headers.append(HttpHeaders.Authorization, "Bearer $newToken")
    }
    return execute(request)
}
