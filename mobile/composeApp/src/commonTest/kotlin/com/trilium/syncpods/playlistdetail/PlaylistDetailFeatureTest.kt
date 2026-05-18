package com.trilium.syncpods.playlistdetail

import app.cash.turbine.test
import com.trilium.syncpods.library.FakePlaylistRepository
import com.trilium.syncpods.library.FakeProfileRepository
import com.trilium.syncpods.library.testPlaylist
import com.trilium.syncpods.playlist.EpisodePayload
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.playlist.PlaylistEpisode
import com.trilium.syncpods.playlist.PlaylistRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class PlaylistDetailFeatureTest {

    @Test
    fun `loads playlist and episodes on ScreenVisible`() = runTest {
        val playlist = testPlaylist("p1", "Morning Mix")
        val episodes = listOf(testEpisode("e1"), testEpisode("e2"))
        val repo = FakePlaylistDetailRepository(playlist = playlist, episodes = episodes)
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals("Morning Mix", latest.playlist?.name)
            assertEquals(2, latest.episodes.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateToPlayer on EpisodeTapped`() = runTest {
        val repo = FakePlaylistDetailRepository(episodes = listOf(testEpisode("e1")))
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        feature.effects.test {
            feature.process(PlaylistDetailEvent.EpisodeTapped(testEpisode("e1")))
            assertIs<PlaylistDetailEffect.NavigateToPlayer>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `removes episode from list`() = runTest {
        val episodes = listOf(testEpisode("e1"), testEpisode("e2"))
        val repo = FakePlaylistDetailRepository(episodes = episodes)
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(PlaylistDetailEvent.EpisodeRemoved("e1"))
            latest = awaitItem()
            assertEquals(1, latest.episodes.size)
            assertEquals("e2", latest.episodes[0].guid)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `reorders episodes optimistically`() = runTest {
        val episodes = listOf(testEpisode("e1"), testEpisode("e2"), testEpisode("e3"))
        val repo = FakePlaylistDetailRepository(episodes = episodes)
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(PlaylistDetailEvent.EpisodesReordered(listOf("e3", "e1", "e2")))
            latest = awaitItem()
            assertEquals(listOf("e3", "e1", "e2"), latest.episodes.map { it.guid })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows rename dialog on RenameTapped`() = runTest {
        val feature = PlaylistDetailFeature(backgroundScope, FakePlaylistDetailRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.RenameTapped)
            val state = awaitItem()
            assertTrue(state.isRenaming)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `dismisses rename dialog on RenameDismissed`() = runTest {
        val feature = PlaylistDetailFeature(backgroundScope, FakePlaylistDetailRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.RenameTapped)
            awaitItem()
            feature.process(PlaylistDetailEvent.RenameDismissed)
            val state = awaitItem()
            assertFalse(state.isRenaming)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateBack on BackTapped`() = runTest {
        val feature = PlaylistDetailFeature(backgroundScope, FakePlaylistDetailRepository(), FakeProfileRepository())

        feature.effects.test {
            feature.process(PlaylistDetailEvent.BackTapped)
            assertIs<PlaylistDetailEffect.NavigateBack>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateBack after playlist deleted`() = runTest {
        val repo = FakePlaylistDetailRepository(playlist = testPlaylist("p1"))
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        feature.effects.test {
            feature.process(PlaylistDetailEvent.DeletePlaylistTapped)
            assertIs<PlaylistDetailEffect.NavigateBack>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

private class FakePlaylistDetailRepository(
    private val playlist: Playlist = testPlaylist("p1"),
    private val episodes: List<PlaylistEpisode> = emptyList(),
) : PlaylistRepository by FakePlaylistRepository() {
    override suspend fun getPlaylistEpisodes(playlistId: String) = episodes
    override suspend fun getPlaylists() = listOf(playlist)
    override suspend fun deletePlaylist(id: String) {}
    override suspend fun removeEpisode(playlistId: String, guid: String) {}
    override suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>) {}
    override suspend fun renamePlaylist(id: String, name: String) {}
    override suspend fun togglePublic(id: String, isPublic: Boolean) {}
}

private fun testEpisode(guid: String) = PlaylistEpisode(
    id = guid,
    guid = guid,
    feedUrl = "https://feed.example.com",
    position = 0,
    title = "Episode $guid",
    podcastTitle = "My Podcast",
    artworkUrl = null,
    audioUrl = "https://audio.example.com/ep.mp3",
    durationSeconds = 3600,
    positionSeconds = null,
    positionPct = null,
    completed = false,
)
