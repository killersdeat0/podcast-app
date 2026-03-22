package com.trilium.syncpods.podcastdetail

import app.cash.turbine.test
import com.trilium.syncpods.discover.PodcastSummary
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class PodcastDetailFeatureTest {

    private val feedUrl = "https://example.com/feed.rss"

    private val sampleSummary = PodcastSummary(
        id = 42L,
        title = "My Podcast",
        artistName = "Test Artist",
        artworkUrl = "https://cdn.example.com/artwork.jpg",
        feedUrl = feedUrl,
        genres = listOf("Technology", "Education"),
        primaryGenre = "Technology",
    )

    private val sampleEpisodes = listOf(
        Episode(
            guid = "ep-001",
            title = "Episode 1",
            audioUrl = "https://example.com/ep1.mp3",
            duration = 3600,
            pubDate = "Mon, 01 Jan 2024 00:00:00 +0000",
            description = "First episode description",
        ),
        Episode(
            guid = "ep-002",
            title = "Episode 2",
            audioUrl = "https://example.com/ep2.mp3",
            duration = 1800,
            pubDate = "Tue, 02 Jan 2024 00:00:00 +0000",
            description = "Second episode description",
        ),
    )

    private val sampleFeed = PodcastFeedResponse(
        title = "My Podcast",
        description = "A great podcast about technology.",
        artworkUrl = "https://rss.example.com/artwork.jpg",
        episodes = sampleEpisodes,
    )

    private fun makeFeature(
        feedRepository: EpisodeFeedRepository = FakeFeedRepository(sampleFeed),
        subscriptionRepository: SubscriptionRepository = FakeSubscriptionRepository(),
        summaryCache: PodcastSummaryCache = PodcastSummaryCache(),
        isGuest: Boolean = false,
    ) = PodcastDetailFeature(
        scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Default),
        feedUrl = feedUrl,
        feedRepository = feedRepository,
        subscriptionRepository = subscriptionRepository,
        summaryCache = summaryCache,
        isGuest = isGuest,
    )

    @Test
    fun `ScreenVisible with cache hit loads header immediately then episodes`() = runTest {
        val cache = PodcastSummaryCache().also { it.put(feedUrl, sampleSummary) }
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = cache,
        )

        feature.state.test {
            awaitItem() // initial empty state

            feature.process(PodcastDetailEvent.ScreenVisible)

            // Header from cache
            var latest = awaitItem()
            while (latest.podcastTitle.isEmpty()) latest = awaitItem()
            assertEquals(sampleSummary.title, latest.podcastTitle)
            assertEquals(sampleSummary.artistName, latest.artistName)
            assertEquals(sampleSummary.artworkUrl, latest.artworkUrl)
            assertEquals(sampleSummary.genres, latest.genres)

            // Episodes loaded from feed (wait for loading to settle too)
            while (latest.episodes.isEmpty() || latest.isLoading) latest = awaitItem()
            assertEquals(sampleEpisodes, latest.episodes)
            assertFalse(latest.isLoading)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `ScreenVisible with cache miss still loads feed`() = runTest {
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(), // empty cache
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(PodcastDetailEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.episodes.isEmpty() || latest.isLoading) latest = awaitItem()
            assertEquals(sampleEpisodes, latest.episodes)
            // artworkUrl comes from feed on cache miss
            assertEquals(sampleFeed.artworkUrl, latest.artworkUrl)
            assertFalse(latest.isLoading)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `FollowTapped when guest shows login prompt`() = runTest {
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
            isGuest = true,
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(PodcastDetailEvent.FollowTapped)

            var latest = awaitItem()
            while (!latest.showLoginPrompt) latest = awaitItem()
            assertTrue(latest.showLoginPrompt)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `FollowTapped when not following calls follow and sets isFollowing = true`() = runTest {
        val subRepo = FakeSubscriptionRepository(initiallyFollowing = false)
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = subRepo,
            summaryCache = PodcastSummaryCache(),
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(PodcastDetailEvent.FollowTapped)

            var latest = awaitItem()
            while (!latest.isFollowing) latest = awaitItem()
            assertTrue(latest.isFollowing)
            assertTrue(subRepo.followCalled)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `FollowTapped when following calls unfollow and sets isFollowing = false`() = runTest {
        val subRepo = FakeSubscriptionRepository(initiallyFollowing = true)
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = subRepo,
            summaryCache = PodcastSummaryCache(),
        )

        // Load screen first to set isFollowing = true from repo
        feature.state.test {
            awaitItem()
            feature.process(PodcastDetailEvent.ScreenVisible)
            var latest = awaitItem()
            while (!latest.isFollowing) latest = awaitItem()

            feature.process(PodcastDetailEvent.FollowTapped)
            while (latest.isFollowing) latest = awaitItem()
            assertFalse(latest.isFollowing)
            assertTrue(subRepo.unfollowCalled)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SortToggled flips sortNewestFirst`() = runTest {
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
        )

        feature.state.test {
            val initial = awaitItem()
            assertTrue(initial.sortNewestFirst) // default true

            feature.process(PodcastDetailEvent.SortToggled)
            val flipped = awaitItem()
            assertFalse(flipped.sortNewestFirst)

            feature.process(PodcastDetailEvent.SortToggled)
            val restored = awaitItem()
            assertTrue(restored.sortNewestFirst)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `ExpandDescriptionTapped toggles isDescriptionExpanded`() = runTest {
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
        )

        feature.state.test {
            val initial = awaitItem()
            assertFalse(initial.isDescriptionExpanded)

            feature.process(PodcastDetailEvent.ExpandDescriptionTapped)
            val expanded = awaitItem()
            assertTrue(expanded.isDescriptionExpanded)

            feature.process(PodcastDetailEvent.ExpandDescriptionTapped)
            val collapsed = awaitItem()
            assertFalse(collapsed.isDescriptionExpanded)

            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Test doubles ──────────────────────────────────────────────────────────────

private class FakeFeedRepository(
    private val feed: PodcastFeedResponse,
) : EpisodeFeedRepository {
    override suspend fun fetchFeed(feedUrl: String): PodcastFeedResponse = feed
}

private class FakeSubscriptionRepository(
    private val initiallyFollowing: Boolean = false,
) : SubscriptionRepository {

    var followCalled = false
    var unfollowCalled = false
    private var following = initiallyFollowing

    override suspend fun isFollowing(feedUrl: String): Boolean = following

    override suspend fun follow(feedUrl: String, title: String, artworkUrl: String, collectionId: Long) {
        followCalled = true
        following = true
    }

    override suspend fun unfollow(feedUrl: String) {
        unfollowCalled = true
        following = false
    }
}
