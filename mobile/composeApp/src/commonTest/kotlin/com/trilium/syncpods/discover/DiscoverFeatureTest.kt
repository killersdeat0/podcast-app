package com.trilium.syncpods.discover

import app.cash.turbine.test
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class DiscoverFeatureTest {

    private val samplePodcast = PodcastSummary(
        id = 1L,
        title = "Test Podcast",
        artistName = "Test Artist",
        artworkUrl = "https://example.com/artwork.jpg",
        feedUrl = "https://example.com/feed.rss",
        genres = listOf("Technology"),
        primaryGenre = "Technology",
    )

    @Test
    fun `loads trending on ScreenVisible`() = runTest {
        val repo = FakePodcastRepository(trendingResult = listOf(samplePodcast))
        // backgroundScope prevents UncompletedCoroutinesError from the feature's pipeline
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial DiscoverState()

            feature.process(DiscoverEvent.ScreenVisible)

            // isLoading becomes true
            val loading = awaitItem()
            assertTrue(loading.isLoading)

            // trendingPodcasts arrive (still loading until SetLoading(false))
            var latest = loading
            while (latest.isLoading || latest.trendingPodcasts.isEmpty()) {
                latest = awaitItem()
            }
            assertFalse(latest.isLoading)
            assertEquals(listOf(samplePodcast), latest.trendingPodcasts)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `search is debounced — rapid QueryChanged fires one search`() = runTest {
        val repo = FakePodcastRepository(searchResult = listOf(samplePodcast))
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(DiscoverEvent.QueryChanged("k"))
            feature.process(DiscoverEvent.QueryChanged("ko"))
            feature.process(DiscoverEvent.QueryChanged("kot"))

            // Advance virtual time past the 300ms debounce window
            delay(400L)

            // Drain until search results are populated
            var latest = awaitItem()
            while (latest.searchResults.isEmpty()) {
                latest = awaitItem()
            }

            assertEquals("kot", latest.query)
            assertEquals(listOf(samplePodcast), latest.searchResults)
            assertEquals(1, repo.searchCallCount)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `genre filter changes trending query`() = runTest {
        val repo = FakePodcastRepository(trendingResult = listOf(samplePodcast))
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(DiscoverEvent.GenreSelected(1303))

            var latest = awaitItem()
            while (latest.trendingPodcasts.isEmpty()) {
                latest = awaitItem()
            }

            assertEquals(1303, latest.selectedGenreId)
            assertEquals(listOf(samplePodcast), latest.trendingPodcasts)
            assertEquals(1303, repo.lastTrendingGenreId)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `PodcastTapped emits NavigateToPodcastDetail effect`() = runTest {
        val repo = FakePodcastRepository()
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.effects.test {
            feature.process(DiscoverEvent.PodcastTapped(samplePodcast))

            val effect = awaitItem()
            assertIs<DiscoverEffect.NavigateToPodcastDetail>(effect)
            assertEquals(samplePodcast.feedUrl, effect.feedUrl)

            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Test double ───────────────────────────────────────────────────────────────

private class FakePodcastRepository(
    private val trendingResult: List<PodcastSummary> = emptyList(),
    private val searchResult: List<PodcastSummary> = emptyList(),
) : PodcastRepository {

    var searchCallCount = 0
    var lastTrendingGenreId: Int? = null

    override suspend fun searchPodcasts(query: String, genreId: Int?): List<PodcastSummary> {
        searchCallCount++
        return searchResult
    }

    override suspend fun fetchTrending(genreId: Int?): List<PodcastSummary> {
        lastTrendingGenreId = genreId
        return trendingResult
    }
}
