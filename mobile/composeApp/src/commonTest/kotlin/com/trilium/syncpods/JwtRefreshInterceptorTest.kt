package com.trilium.syncpods

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.plugin
import io.ktor.client.request.get
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class JwtRefreshInterceptorTest {

    @Test
    fun `non-401 response passes through without calling refresh`() = runTest {
        var requestCount = 0
        var refreshCalled = false
        val client = clientWithInterceptor(
            responses = listOf(HttpStatusCode.OK),
            onRequestMade = { requestCount++ },
            onRefresh = { refreshCalled = true },
            newToken = null,
        )

        client.get("http://test/api")

        assertEquals(1, requestCount)
        assertFalse(refreshCalled)
    }

    @Test
    fun `401 triggers token refresh and retries with new token in header`() = runTest {
        val capturedAuthHeaders = mutableListOf<String?>()
        val client = clientWithInterceptor(
            responses = listOf(HttpStatusCode.Unauthorized, HttpStatusCode.OK),
            onRequestMade = { authHeader -> capturedAuthHeaders += authHeader },
            onRefresh = {},
            newToken = "refreshed-token",
            initialToken = "expired-token",
        )

        client.get("http://test/api")

        assertEquals(2, capturedAuthHeaders.size)
        assertEquals("Bearer expired-token", capturedAuthHeaders[0])
        assertEquals("Bearer refreshed-token", capturedAuthHeaders[1])
    }

    @Test
    fun `when refresh throws the retry still happens`() = runTest {
        var requestCount = 0
        var refreshCalled = false
        val client = clientWithInterceptor(
            responses = listOf(HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized),
            onRequestMade = { requestCount++ },
            onRefresh = {
                refreshCalled = true
                error("network error during refresh")
            },
            newToken = null,
        )

        client.get("http://test/api")

        assertTrue(refreshCalled)
        assertEquals(2, requestCount)
    }
}

private fun clientWithInterceptor(
    responses: List<HttpStatusCode>,
    onRequestMade: (authHeader: String?) -> Unit,
    onRefresh: suspend () -> Unit,
    newToken: String?,
    initialToken: String = "initial-token",
): HttpClient {
    var callIndex = 0
    val engine = MockEngine { request ->
        onRequestMade(request.headers[HttpHeaders.Authorization])
        val status = responses[callIndex.coerceAtMost(responses.lastIndex)]
        callIndex++
        respond("", status, headersOf())
    }
    val client = HttpClient(engine)
    client.plugin(HttpSend).intercept { request ->
        request.headers.append(HttpHeaders.Authorization, "Bearer $initialToken")
        jwtRefreshIntercept(
            request = request,
            onRefresh = onRefresh,
            getToken = { newToken },
        )
    }
    return client
}
