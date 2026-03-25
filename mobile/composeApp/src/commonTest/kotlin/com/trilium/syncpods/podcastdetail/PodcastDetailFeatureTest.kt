package com.trilium.syncpods.podcastdetail

import app.cash.turbine.test
import com.trilium.syncpods.discover.PodcastSummary
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import com.trilium.syncpods.profile.UserProfile
import com.trilium.syncpods.queue.QueueItem
import com.trilium.syncpods.queue.QueueRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
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
        queueRepository: FakeQueueRepository = FakeQueueRepository(),
        profileRepository: ProfileRepository = FakeProfileRepository(tier = queueRepository.tier),
    ) = PodcastDetailFeature(
        scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Default),
        feedUrl = feedUrl,
        feedRepository = feedRepository,
        subscriptionRepository = subscriptionRepository,
        summaryCache = summaryCache,
        queueRepository = queueRepository,
        profileRepository = profileRepository,
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
            queueRepository = FakeQueueRepository(),
            profileRepository = FakeProfileRepository(),
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
            queueRepository = FakeQueueRepository(),
            profileRepository = FakeProfileRepository(),
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
            queueRepository = FakeQueueRepository(guest = true),
            profileRepository = FakeProfileRepository(),
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
            queueRepository = FakeQueueRepository(),
            profileRepository = FakeProfileRepository(),
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
            queueRepository = FakeQueueRepository(),
            profileRepository = FakeProfileRepository(),
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
    fun `EpisodeQueueToggleTapped when not queued adds to queue and updates queuedGuids`() = runTest {
        val queueRepo = FakeQueueRepository()
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
            queueRepository = queueRepo,
            profileRepository = FakeProfileRepository(tier = queueRepo.tier),
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(PodcastDetailEvent.EpisodeQueueToggleTapped(sampleEpisodes[0]))

            var latest = awaitItem()
            while (sampleEpisodes[0].guid !in latest.queuedGuids) latest = awaitItem()
            assertTrue(sampleEpisodes[0].guid in latest.queuedGuids)
            assertEquals(sampleEpisodes[0].guid, queueRepo.addCalledWith)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `EpisodeQueueToggleTapped when queued removes from queue and updates queuedGuids`() = runTest {
        val queueRepo = FakeQueueRepository(initialQueuedGuids = setOf(sampleEpisodes[0].guid))
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
            queueRepository = queueRepo,
            profileRepository = FakeProfileRepository(tier = queueRepo.tier),
        )

        feature.state.test {
            awaitItem() // initial (queuedGuids is empty until ScreenVisible loads them)

            // Seed queuedGuids via ScreenVisible so the toggle can detect the episode is queued
            feature.process(PodcastDetailEvent.ScreenVisible)
            var latest = awaitItem()
            while (sampleEpisodes[0].guid !in latest.queuedGuids) latest = awaitItem()

            feature.process(PodcastDetailEvent.EpisodeQueueToggleTapped(sampleEpisodes[0]))

            while (sampleEpisodes[0].guid in latest.queuedGuids) latest = awaitItem()
            assertFalse(sampleEpisodes[0].guid in latest.queuedGuids)
            assertEquals(sampleEpisodes[0].guid, queueRepo.removeCalledWith)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `EpisodeQueueToggleTapped when guest has fewer than 10 queued items adds to queue`() = runTest {
        val queueRepo = FakeQueueRepository(guest = true)
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
            queueRepository = queueRepo,
            profileRepository = FakeProfileRepository(tier = queueRepo.tier),
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(PodcastDetailEvent.EpisodeQueueToggleTapped(sampleEpisodes[0]))

            var latest = awaitItem()
            while (sampleEpisodes[0].guid !in latest.queuedGuids) latest = awaitItem()
            assertTrue(sampleEpisodes[0].guid in latest.queuedGuids)
            assertFalse(latest.showLoginPrompt)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `EpisodeQueueToggleTapped when free user has 10 or more queued items shows login prompt`() = runTest {
        val tenGuids = (1..10).map { "other-guid-$it" }.toSet()
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
            queueRepository = FakeQueueRepository(tier = "free", initialQueuedGuids = tenGuids),
            profileRepository = FakeProfileRepository(tier = "free"),
        )

        feature.state.test {
            awaitItem() // initial

            // Load screen to populate queuedGuids and userTier in state
            feature.process(PodcastDetailEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.queuedGuids.size < 10) latest = awaitItem()

            feature.process(PodcastDetailEvent.EpisodeQueueToggleTapped(sampleEpisodes[0]))

            while (!latest.showLoginPrompt) latest = awaitItem()
            assertTrue(latest.showLoginPrompt)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `EpisodeQueueToggleTapped when paid user has 10 or more queued items adds to queue`() = runTest {
        val tenGuids = (1..10).map { "other-guid-$it" }.toSet()
        val queueRepo = FakeQueueRepository(tier = "paid", initialQueuedGuids = tenGuids)
        val feature = PodcastDetailFeature(
            scope = backgroundScope,
            feedUrl = feedUrl,
            feedRepository = FakeFeedRepository(sampleFeed),
            subscriptionRepository = FakeSubscriptionRepository(),
            summaryCache = PodcastSummaryCache(),
            queueRepository = queueRepo,
            profileRepository = FakeProfileRepository(tier = queueRepo.tier),
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(PodcastDetailEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.userTier != "paid") latest = awaitItem()

            feature.process(PodcastDetailEvent.EpisodeQueueToggleTapped(sampleEpisodes[0]))

            while (sampleEpisodes[0].guid !in latest.queuedGuids) latest = awaitItem()
            assertTrue(sampleEpisodes[0].guid in latest.queuedGuids)
            assertFalse(latest.showLoginPrompt)
            assertEquals(sampleEpisodes[0].guid, queueRepo.addCalledWith)

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
            queueRepository = FakeQueueRepository(),
            profileRepository = FakeProfileRepository(),
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
            queueRepository = FakeQueueRepository(),
            profileRepository = FakeProfileRepository(),
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

private class FakeQueueRepository(
    private val initialQueuedGuids: Set<String> = emptySet(),
    private val guest: Boolean = false,
    val tier: String = "free",
    var addCalledWith: String? = null,
    var removeCalledWith: String? = null,
    var shouldThrowOnAdd: Boolean = false,
) : QueueRepository {
    override fun isGuest(): Boolean = guest
    override suspend fun getQueuedGuids(): Set<String> = initialQueuedGuids
    override suspend fun addEpisode(
        guid: String,
        feedUrl: String,
        title: String,
        audioUrl: String,
        durationSeconds: Int?,
        pubDate: String?,
        podcastTitle: String,
        artworkUrl: String?,
    ) {
        addCalledWith = guid
        if (shouldThrowOnAdd) throw Exception("Add failed")
    }
    override suspend fun getQueue(): List<QueueItem> = emptyList()
    override suspend fun removeEpisode(guid: String) { removeCalledWith = guid }
    override suspend fun reorderQueue(orderedGuids: List<String>) {}
}

private class FakeProfileRepository(private val tier: String = "free") : ProfileRepository {
    override fun isGuest(): Boolean = false
    override suspend fun getUserTier(): String = tier
    override suspend fun getUserProfile() = UserProfile("", "", tier)
    override suspend fun getSubscriptions() = emptyList<SubscriptionSummary>()
}

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
