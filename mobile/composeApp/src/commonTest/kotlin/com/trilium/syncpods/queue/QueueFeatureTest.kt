package com.trilium.syncpods.queue

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class QueueFeatureTest {

    // ── Tests ─────────────────────────────────────────────────────────────────

    @Test
    fun `loads queue and tier on ScreenVisible`() = runTest {
        val items = listOf(
            testQueueItem(guid = "guid-1", position = 0),
            testQueueItem(guid = "guid-2", position = 1),
        )
        val repo = FakeQueueRepository(queueItems = items, tier = "free")
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial QueueState()

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertFalse(latest.isLoading)
            assertEquals(2, latest.items.size)
            assertEquals("free", latest.tier)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows loading state while queue loads`() = runTest {
        val repo = FakeQueueRepository()
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            val loading = awaitItem()
            assertTrue(loading.isLoading)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows inline upgrade card when free tier has 7 or more items`() = runTest {
        val items = (1..7).map { testQueueItem(guid = "guid-$it", position = it - 1) }
        val repo = FakeQueueRepository(queueItems = items, tier = "free")
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertTrue(latest.showUpgradeCard)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `does not show upgrade card when free tier has fewer than 7 items`() = runTest {
        val items = (1..6).map { testQueueItem(guid = "guid-$it", position = it - 1) }
        val repo = FakeQueueRepository(queueItems = items, tier = "free")
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertFalse(latest.showUpgradeCard)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `does not show upgrade card for paid tier`() = runTest {
        val items = (1..8).map { testQueueItem(guid = "guid-$it", position = it - 1) }
        val repo = FakeQueueRepository(queueItems = items, tier = "paid")
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertFalse(latest.showUpgradeCard)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `removes episode and updates list`() = runTest {
        val items = listOf(
            testQueueItem(guid = "guid-1", position = 0),
            testQueueItem(guid = "guid-2", position = 1),
            testQueueItem(guid = "guid-3", position = 2),
        )
        val repo = FakeQueueRepository(queueItems = items)
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(QueueEvent.EpisodeRemoved("guid-1"))

            latest = awaitItem()
            assertFalse(latest.items.any { it.guid == "guid-1" })
            assertEquals(2, latest.items.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `reorders queue optimistically`() = runTest {
        val items = listOf(
            testQueueItem(guid = "guid-1", position = 0),
            testQueueItem(guid = "guid-2", position = 1),
            testQueueItem(guid = "guid-3", position = 2),
        )
        val repo = FakeQueueRepository(queueItems = items)
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(QueueEvent.EpisodesReordered(listOf("guid-3", "guid-1", "guid-2")))

            latest = awaitItem()
            assertEquals("guid-3", latest.items[0].guid)
            assertEquals("guid-1", latest.items[1].guid)
            assertEquals("guid-2", latest.items[2].guid)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `guest can remove episode without login prompt`() = runTest {
        val items = listOf(testQueueItem(guid = "guid-1"))
        val repo = FakeQueueRepository(queueItems = items, guest = true)
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial
            feature.process(QueueEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(QueueEvent.EpisodeRemoved("guid-1"))
            latest = awaitItem()
            assertTrue(latest.items.isEmpty())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `guest can reorder queue without login prompt`() = runTest {
        val items = listOf(
            testQueueItem(guid = "a"),
            testQueueItem(guid = "b"),
        )
        val repo = FakeQueueRepository(queueItems = items, guest = true)
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial
            feature.process(QueueEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(QueueEvent.EpisodesReordered(listOf("b", "a")))
            latest = awaitItem()
            assertEquals(listOf("b", "a"), latest.items.map { it.guid })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `sets nowPlayingGuid when episode tapped`() = runTest {
        val items = listOf(testQueueItem(guid = "guid-42"))
        val repo = FakeQueueRepository(queueItems = items)
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(QueueEvent.EpisodeTapped("guid-42"))

            latest = awaitItem()
            assertEquals("guid-42", latest.nowPlayingGuid)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits PlayEpisode effect when episode tapped`() = runTest {
        val items = listOf(testQueueItem(guid = "guid-42"))
        val repo = FakeQueueRepository(queueItems = items)
        val feature = QueueFeature(backgroundScope, repo)

        // Load queue first so state has the item
        feature.state.test {
            awaitItem() // initial
            feature.process(QueueEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        feature.effects.test {
            feature.process(QueueEvent.EpisodeTapped("guid-42"))

            assertIs<QueueEffect.PlayEpisode>(awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateToUpgrade effect when upgrade tapped`() = runTest {
        val repo = FakeQueueRepository()
        val feature = QueueFeature(backgroundScope, repo)

        feature.effects.test {
            feature.process(QueueEvent.UpgradeTapped)

            assertIs<QueueEffect.NavigateToUpgrade>(awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows error state when load fails`() = runTest {
        val repo = FakeQueueRepository(shouldThrowOnGet = true)
        val feature = QueueFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial

            feature.process(QueueEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertFalse(latest.isLoading)
            assertNotNull(latest.error)

            cancelAndIgnoreRemainingEvents()
        }
    }

}

// ── Fake repository ───────────────────────────────────────────────────────────

private class FakeQueueRepository(
    private val queueItems: List<QueueItem> = emptyList(),
    private val tier: String = "free",
    private val guest: Boolean = false,
    var removeCalledWith: String? = null,
    var reorderCalledWith: List<String>? = null,
    var addCalledWith: String? = null,
    var shouldThrowOnGet: Boolean = false,
    var shouldThrowOnRemove: Boolean = false,
    var shouldThrowOnReorder: Boolean = false,
    var shouldThrowOnAdd: Boolean = false,
) : QueueRepository {
    override suspend fun getQueue(): List<QueueItem> {
        if (shouldThrowOnGet) throw Exception("Network error")
        return queueItems
    }
    override suspend fun getQueuedGuids(): Set<String> = queueItems.map { it.guid }.toSet()
    override suspend fun getUserTier(): String = tier
    override suspend fun removeEpisode(guid: String) {
        removeCalledWith = guid
        if (shouldThrowOnRemove) throw Exception("Remove failed")
    }
    override suspend fun reorderQueue(orderedGuids: List<String>) {
        reorderCalledWith = orderedGuids
        if (shouldThrowOnReorder) throw Exception("Reorder failed")
    }
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
    override fun isGuest(): Boolean = guest
}

// ── Test helpers ──────────────────────────────────────────────────────────────

private fun testQueueItem(
    guid: String = "guid-1",
    title: String = "Episode Title",
    podcastTitle: String = "Podcast Name",
    position: Int = 0,
) = QueueItem(
    guid = guid,
    feedUrl = "https://feed.example.com",
    position = position,
    title = title,
    podcastTitle = podcastTitle,
    artworkUrl = null,
    audioUrl = "https://audio.example.com/episode.mp3",
    durationSeconds = 3600,
)
