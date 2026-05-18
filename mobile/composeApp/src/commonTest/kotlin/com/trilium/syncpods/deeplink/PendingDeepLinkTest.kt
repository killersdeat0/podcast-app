package com.trilium.syncpods.deeplink

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PendingDeepLinkTest {

    @Test
    fun `initial route is null`() = runTest {
        val pending = PendingDeepLink()
        assertNull(pending.route.value)
    }

    @Test
    fun `set emits route`() = runTest {
        val pending = PendingDeepLink()
        pending.route.test {
            assertNull(awaitItem())
            pending.set("playlist/abc-123")
            assertEquals("playlist/abc-123", awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `consume clears route to null`() = runTest {
        val pending = PendingDeepLink()
        pending.set("playlist/abc-123")
        assertEquals("playlist/abc-123", pending.route.value)
        pending.consume()
        assertNull(pending.route.value)
    }

    @Test
    fun `set overwrites a previous route`() = runTest {
        val pending = PendingDeepLink()
        pending.set("playlist/first")
        pending.set("playlist/second")
        assertEquals("playlist/second", pending.route.value)
    }
}
