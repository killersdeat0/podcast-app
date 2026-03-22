package com.trilium.syncpods.discover

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
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
    fun `genre filter loads trending for selected genre`() = runTest {
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
    fun `SearchSubmitted emits NavigateToSearch effect`() = runTest {
        val repo = FakePodcastRepository()
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.effects.test {
            feature.process(DiscoverEvent.SearchSubmitted("kotlin"))

            val effect = awaitItem()
            assertIs<DiscoverEffect.NavigateToSearch>(effect)
            assertEquals("kotlin", effect.query)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `blank SearchSubmitted is ignored — no effect emitted`() = runTest {
        val repo = FakePodcastRepository()
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.effects.test {
            feature.process(DiscoverEvent.SearchSubmitted(""))
            feature.process(DiscoverEvent.SearchSubmitted("   "))

            // No effects should be emitted for blank queries
            expectNoEvents()

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SearchQueryChanged after debounce loads suggestions`() = runTest {
        val repo = FakePodcastRepository(searchResult = listOf(samplePodcast))
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial
            feature.process(DiscoverEvent.SearchQueryChanged("daily"))
            var latest = awaitItem()
            while (latest.isSuggestionsLoading || latest.suggestions.isEmpty()) latest = awaitItem()
            assertEquals(listOf(samplePodcast), latest.suggestions)
            assertEquals("daily", repo.lastSearchQuery)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `blank SearchQueryChanged clears suggestions`() = runTest {
        val repo = FakePodcastRepository(searchResult = listOf(samplePodcast))
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial
            feature.process(DiscoverEvent.SearchQueryChanged("daily"))
            var latest = awaitItem()
            while (latest.suggestions.isEmpty()) latest = awaitItem()
            assertTrue(latest.suggestions.isNotEmpty())

            feature.process(DiscoverEvent.SearchQueryChanged(""))
            while (latest.suggestions.isNotEmpty()) latest = awaitItem()
            assertTrue(latest.suggestions.isEmpty())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `suggestions preserved when ScreenVisible fires`() = runTest {
        val repo = FakePodcastRepository(
            trendingResult = listOf(samplePodcast),
            searchResult = listOf(samplePodcast),
        )
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial
            feature.process(DiscoverEvent.SearchQueryChanged("daily"))
            var latest = awaitItem()
            while (latest.suggestions.isEmpty()) latest = awaitItem()
            assertTrue(latest.suggestions.isNotEmpty())

            feature.process(DiscoverEvent.ScreenVisible)
            var settled = awaitItem()
            while (settled.isLoading) settled = awaitItem()
            assertTrue(settled.suggestions.isNotEmpty())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SuggestionTapped emits NavigateToPodcastDetail effect`() = runTest {
        val repo = FakePodcastRepository()
        val feature = DiscoverFeature(backgroundScope, repo)

        feature.effects.test {
            feature.process(DiscoverEvent.SuggestionTapped(samplePodcast))
            val effect = awaitItem()
            assertIs<DiscoverEffect.NavigateToPodcastDetail>(effect)
            assertEquals(samplePodcast.feedUrl, effect.feedUrl)
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

    var lastTrendingGenreId: Int? = null
    var lastSearchQuery: String? = null

    override suspend fun searchPodcasts(query: String, genreId: Int?): List<PodcastSummary> {
        lastSearchQuery = query
        return searchResult
    }

    override suspend fun fetchTrending(genreId: Int?): List<PodcastSummary> {
        lastTrendingGenreId = genreId
        return trendingResult
    }
}
