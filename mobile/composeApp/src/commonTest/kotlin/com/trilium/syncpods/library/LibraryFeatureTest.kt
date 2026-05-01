package com.trilium.syncpods.library

import app.cash.turbine.test
import com.trilium.syncpods.playlist.EpisodePayload
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.playlist.PlaylistEpisode
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import com.trilium.syncpods.profile.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LibraryFeatureTest {

    @Test
    fun `loads playlists and subscriptions on ScreenVisible`() = runTest {
        val playlists = listOf(testPlaylist("1"), testPlaylist("2"))
        val subs = listOf(SubscriptionSummary("https://feed.example.com", "My Pod", ""))
        val feature = LibraryFeature(
            backgroundScope,
            FakePlaylistRepository(playlists = playlists),
            FakeProfileRepository(subscriptions = subs),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals(2, latest.playlists.size)
            assertEquals(1, latest.subscriptions.size)
            assertFalse(latest.isLoading)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows loading state while data loads`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.ScreenVisible)
            val loading = awaitItem()
            assertTrue(loading.isLoading)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `opens create dialog on CreatePlaylistTapped`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.CreatePlaylistTapped)
            val state = awaitItem()
            assertTrue(state.showCreateDialog)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `updates create dialog name on CreateDialogNameChanged`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.CreatePlaylistTapped)
            awaitItem() // dialog open
            feature.process(LibraryEvent.CreateDialogNameChanged("Road Trip"))
            val state = awaitItem()
            assertEquals("Road Trip", state.createDialogName)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `dismisses create dialog on CreateDialogDismissed`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.CreatePlaylistTapped)
            awaitItem() // dialog open
            feature.process(LibraryEvent.CreateDialogDismissed)
            val state = awaitItem()
            assertFalse(state.showCreateDialog)
            assertEquals("", state.createDialogName)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `adds playlist and closes dialog on CreateDialogConfirmed`() = runTest {
        val repo = FakePlaylistRepository()
        val feature = LibraryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.CreatePlaylistTapped)
            awaitItem()
            feature.process(LibraryEvent.CreateDialogNameChanged("New Playlist"))
            awaitItem()
            feature.process(LibraryEvent.CreateDialogConfirmed)
            var latest = awaitItem()
            while (latest.showCreateDialog) latest = awaitItem()

            assertFalse(latest.showCreateDialog)
            assertEquals(1, latest.playlists.size)
            assertEquals("New Playlist", latest.playlists[0].name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `removes playlist on PlaylistDeleted`() = runTest {
        val repo = FakePlaylistRepository(playlists = listOf(testPlaylist("p1"), testPlaylist("p2")))
        val feature = LibraryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(LibraryEvent.PlaylistDeleted("p1"))
            latest = awaitItem()
            assertEquals(1, latest.playlists.size)
            assertEquals("p2", latest.playlists[0].id)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateToPlaylist on PlaylistTapped`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.effects.test {
            feature.process(LibraryEvent.PlaylistTapped("abc"))
            val effect = awaitItem()
            assertIs<LibraryEffect.NavigateToPlaylist>(effect)
            assertEquals("abc", (effect as LibraryEffect.NavigateToPlaylist).id)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateToPodcast on SubscriptionTapped`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.effects.test {
            feature.process(LibraryEvent.SubscriptionTapped("https://feed.example.com"))
            val effect = awaitItem()
            assertIs<LibraryEffect.NavigateToPodcast>(effect)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows login prompt for guest user`() = runTest {
        val feature = LibraryFeature(
            backgroundScope,
            FakePlaylistRepository(),
            FakeProfileRepository(guest = true),
        )

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            assertTrue(latest.showLoginPrompt)
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

internal class FakePlaylistRepository(
    private val playlists: List<Playlist> = emptyList(),
    private val shouldThrow: Boolean = false,
) : PlaylistRepository {
    private val mutablePlaylists = playlists.toMutableList()
    var createdName: String? = null

    override suspend fun getPlaylists(): List<Playlist> {
        if (shouldThrow) throw Exception("Network error")
        return mutablePlaylists.toList()
    }
    override suspend fun createPlaylist(name: String, description: String?): Playlist {
        createdName = name
        val p = testPlaylist(id = "new-${mutablePlaylists.size}", name = name)
        mutablePlaylists.add(p)
        return p
    }
    override suspend fun renamePlaylist(id: String, name: String) {}
    override suspend fun deletePlaylist(id: String) { mutablePlaylists.removeAll { it.id == id } }
    override suspend fun togglePublic(id: String, isPublic: Boolean) {}
    override suspend fun reorderPlaylists(orderedIds: List<String>) {}
    override suspend fun getPlaylistEpisodes(playlistId: String): List<PlaylistEpisode> = emptyList()
    override suspend fun addEpisode(playlistId: String, episode: EpisodePayload) {}
    override suspend fun removeEpisode(playlistId: String, guid: String) {}
    override suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>) {}
}

internal class FakeProfileRepository(
    private val tier: String = "free",
    private val subscriptions: List<SubscriptionSummary> = emptyList(),
    private val guest: Boolean = false,
) : ProfileRepository {
    override fun isGuest(): Boolean = guest
    override fun authStateChanges(): Flow<Unit> = emptyFlow()
    override suspend fun getUserTier(): String = tier
    override suspend fun getUserProfile() = UserProfile("", "", tier)
    override suspend fun getSubscriptions(): List<SubscriptionSummary> = subscriptions
}

internal fun testPlaylist(
    id: String = "playlist-1",
    name: String = "Test Playlist",
) = Playlist(id = id, name = name, description = null, isPublic = false, position = 0, episodeCount = 0, artworkUrls = emptyList())
