package com.trilium.syncpods.search

import app.cash.turbine.test
import com.trilium.syncpods.discover.PodcastRepository
import com.trilium.syncpods.discover.PodcastSummary
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class SearchFeatureTest {

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
    fun `QueryChanged after debounce loads suggestions`() = runTest {
        val repo = FakeSearchRepository(searchResult = listOf(samplePodcast))
        val feature = SearchFeature(backgroundScope, repo, com.trilium.syncpods.podcastdetail.PodcastSummaryCache())

        feature.state.test {
            awaitItem() // initial
            feature.process(SearchEvent.QueryChanged("daily"))
            var latest = awaitItem()
            while (latest.isSuggestionsLoading || latest.suggestions.isEmpty()) latest = awaitItem()
            assertEquals(listOf(samplePodcast), latest.suggestions)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `blank QueryChanged clears suggestions`() = runTest {
        val repo = FakeSearchRepository(searchResult = listOf(samplePodcast))
        val feature = SearchFeature(backgroundScope, repo, com.trilium.syncpods.podcastdetail.PodcastSummaryCache())

        feature.state.test {
            awaitItem() // initial
            feature.process(SearchEvent.QueryChanged("daily"))
            var latest = awaitItem()
            while (latest.suggestions.isEmpty()) latest = awaitItem()
            assertTrue(latest.suggestions.isNotEmpty())

            feature.process(SearchEvent.QueryChanged(""))
            while (latest.suggestions.isNotEmpty()) latest = awaitItem()
            assertTrue(latest.suggestions.isEmpty())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SuggestionTapped emits NavigateToPodcastDetail effect`() = runTest {
        val repo = FakeSearchRepository()
        val feature = SearchFeature(backgroundScope, repo, com.trilium.syncpods.podcastdetail.PodcastSummaryCache())

        feature.effects.test {
            feature.process(SearchEvent.SuggestionTapped(samplePodcast))
            val effect = awaitItem()
            assertIs<SearchEffect.NavigateToPodcastDetail>(effect)
            assertEquals(samplePodcast.feedUrl, effect.feedUrl)
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Test double ───────────────────────────────────────────────────────────────

private class FakeSearchRepository(
    private val searchResult: List<PodcastSummary> = emptyList(),
    private val trendingResult: List<PodcastSummary> = emptyList(),
) : PodcastRepository {
    override suspend fun searchPodcasts(query: String, genreId: Int?) = searchResult
    override suspend fun fetchTrending(genreId: Int?) = trendingResult
}
