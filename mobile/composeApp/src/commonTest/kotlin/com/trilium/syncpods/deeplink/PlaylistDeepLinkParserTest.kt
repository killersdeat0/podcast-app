package com.trilium.syncpods.deeplink

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PlaylistDeepLinkParserTest {

    @Test
    fun `returns nav route for valid playlist url`() {
        assertEquals("playlist/abc-123", parsePlaylistDeepLink("https://syncpods.app/playlist/abc-123"))
    }

    @Test
    fun `returns nav route and strips trailing slash`() {
        assertEquals("playlist/abc-123", parsePlaylistDeepLink("https://syncpods.app/playlist/abc-123/"))
    }

    @Test
    fun `returns null for non-playlist https url`() {
        assertNull(parsePlaylistDeepLink("https://syncpods.app/discover"))
    }

    @Test
    fun `returns null for playlist url with empty id`() {
        assertNull(parsePlaylistDeepLink("https://syncpods.app/playlist/"))
    }

    @Test
    fun `returns null for syncpods auth scheme`() {
        assertNull(parsePlaylistDeepLink("syncpods://auth"))
    }

    @Test
    fun `returns null for blank string`() {
        assertNull(parsePlaylistDeepLink(""))
    }

    @Test
    fun `returns nav route and strips query parameters`() {
        assertEquals("playlist/abc-123", parsePlaylistDeepLink("https://syncpods.app/playlist/abc-123?utm_source=share"))
    }

    @Test
    fun `returns nav route and strips fragment`() {
        assertEquals("playlist/abc-123", parsePlaylistDeepLink("https://syncpods.app/playlist/abc-123#section"))
    }
}
