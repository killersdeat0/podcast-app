package com.trilium.syncpods.history

import app.cash.turbine.test
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import com.trilium.syncpods.profile.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlin.time.Clock
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HistoryFeatureTest {

    @Test
    fun `loads history on ScreenVisible`() = runTest {
        val item = testHistoryItem(guid = "ep-1", updatedAt = "2020-01-01T00:00:00Z")
        val repo = FakeHistoryRepository(items = listOf(item))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(HistoryEvent.ScreenVisible)

            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertFalse(latest.isLoading)
            assertNull(latest.error)
            val allItems = latest.allGroups.flatMap { it.items }
            assertEquals(1, allItems.size)
            assertEquals("ep-1", allItems[0].guid)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows loading state while history loads`() = runTest {
        val repo = FakeHistoryRepository()
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial

            feature.process(HistoryEvent.ScreenVisible)

            val loading = awaitItem()
            assertTrue(loading.isLoading)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `passes isFreeTier true to repository when user is on free tier`() = runTest {
        val repo = FakeHistoryRepository()
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository(tier = "free"))

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        assertEquals(true, repo.isFreeTierCaptured)
    }

    @Test
    fun `passes isFreeTier false to repository when user is on paid tier`() = runTest {
        val repo = FakeHistoryRepository()
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository(tier = "paid"))

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        assertEquals(false, repo.isFreeTierCaptured)
    }

    @Test
    fun `groups items from today into Today bucket`() = runTest {
        val todayItem = testHistoryItem(guid = "today", updatedAt = Clock.System.now().toString())
        val repo = FakeHistoryRepository(items = listOf(todayItem))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals(1, latest.allGroups.size)
            assertEquals("Today", latest.allGroups[0].label)
            assertEquals(1, latest.allGroups[0].items.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `groups items from 3 days ago into This Week bucket`() = runTest {
        val threeDaysAgo = Instant.fromEpochMilliseconds(
            Clock.System.now().toEpochMilliseconds() - 3L * 24 * 60 * 60 * 1000
        ).toString()
        val item = testHistoryItem(guid = "week", updatedAt = threeDaysAgo)
        val repo = FakeHistoryRepository(items = listOf(item))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals(1, latest.allGroups.size)
            assertEquals("This Week", latest.allGroups[0].label)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `groups old items into Earlier bucket`() = runTest {
        val oldItem = testHistoryItem(guid = "old", updatedAt = "2020-01-01T00:00:00Z")
        val repo = FakeHistoryRepository(items = listOf(oldItem))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals(1, latest.allGroups.size)
            assertEquals("Earlier", latest.allGroups[0].label)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `omits empty date buckets from allGroups`() = runTest {
        val oldItem = testHistoryItem(guid = "old", updatedAt = "2020-01-01T00:00:00Z")
        val repo = FakeHistoryRepository(items = listOf(oldItem))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertTrue(latest.allGroups.none { it.label == "Today" })
            assertTrue(latest.allGroups.none { it.label == "This Week" })

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `populates inProgressItems with started but not completed episodes`() = runTest {
        val inProgress = testHistoryItem(
            guid = "in-progress",
            positionSeconds = 600,
            positionPct = 0.5f,
            completed = false,
            updatedAt = "2020-01-01T00:00:00Z",
        )
        val completed = testHistoryItem(
            guid = "completed",
            positionSeconds = 3500,
            positionPct = 99f,
            completed = true,
            updatedAt = "2020-01-01T00:00:00Z",
        )
        val repo = FakeHistoryRepository(items = listOf(inProgress, completed))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals(1, latest.inProgressItems.size)
            assertEquals("in-progress", latest.inProgressItems[0].guid)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `excludes episodes with fewer than 30 seconds from inProgressItems`() = runTest {
        val tooShort = testHistoryItem(
            guid = "short",
            positionSeconds = 10,
            positionPct = 0.1f,
            completed = false,
            updatedAt = "2020-01-01T00:00:00Z",
        )
        val repo = FakeHistoryRepository(items = listOf(tooShort))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertTrue(latest.inProgressItems.isEmpty())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `switching tab updates activeTab without re-fetching`() = runTest {
        val repo = FakeHistoryRepository()
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            val callsBefore = repo.getHistoryCallCount

            feature.process(HistoryEvent.TabSelected(HistoryTab.InProgress))
            latest = awaitItem()

            assertEquals(HistoryTab.InProgress, latest.activeTab)
            assertEquals(callsBefore, repo.getHistoryCallCount)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits PlayEpisode effect when episode tapped`() = runTest {
        val item = testHistoryItem(guid = "ep-play")
        val repo = FakeHistoryRepository(items = listOf(item))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        feature.effects.test {
            feature.process(HistoryEvent.EpisodeTapped(item))
            val effect = awaitItem()
            assertIs<HistoryEffect.PlayEpisode>(effect)
            assertEquals("ep-play", effect.item.guid)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows error state when repository throws`() = runTest {
        val repo = FakeHistoryRepository(shouldThrow = true)
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertFalse(latest.isLoading)
            assertNotNull(latest.error)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `retries load on RetryTapped`() = runTest {
        val repo = FakeHistoryRepository(shouldThrow = true)
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            assertNotNull(latest.error)

            repo.shouldThrow = false
            feature.process(HistoryEvent.RetryTapped)
            latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertNull(latest.error)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `silently refreshes history on ProgressSaved without showing loading state`() = runTest {
        val itemA = testHistoryItem(guid = "ep-a", updatedAt = "2020-01-01T00:00:00Z")
        val itemB = testHistoryItem(guid = "ep-b", updatedAt = "2020-01-02T00:00:00Z")
        val repo = FakeHistoryRepository(items = listOf(itemA))
        val progressUpdates = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository(), progressUpdates)

        feature.state.test {
            awaitItem() // consume initial

            feature.process(HistoryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals(listOf("ep-a"), latest.allGroups.flatMap { it.items }.map { it.guid })

            // Swap items and trigger silent reload
            repo.items = listOf(itemB)
            progressUpdates.emit(Unit)

            // Must receive updated state without isLoading becoming true
            latest = awaitItem()
            assertFalse(latest.isLoading, "Silent reload must not show a loading spinner")
            assertEquals(listOf("ep-b"), latest.allGroups.flatMap { it.items }.map { it.guid })

            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

private class FakeHistoryRepository(
    var items: List<HistoryItem> = emptyList(),
    var shouldThrow: Boolean = false,
    var isFreeTierCaptured: Boolean? = null,
    var getHistoryCallCount: Int = 0,
) : HistoryRepository {
    override suspend fun getHistory(isFreeTier: Boolean): List<HistoryItem> {
        isFreeTierCaptured = isFreeTier
        getHistoryCallCount++
        if (shouldThrow) throw Exception("Network error")
        return items
    }
}

private class FakeProfileRepository(private val tier: String = "free") : ProfileRepository {
    override fun isGuest(): Boolean = false
    override fun authStateChanges(): Flow<Unit> = emptyFlow()
    override suspend fun getUserTier(): String = tier
    override suspend fun getUserProfile() = UserProfile("", "", tier)
    override suspend fun getSubscriptions() = emptyList<SubscriptionSummary>()
}

// ── Test helpers ──────────────────────────────────────────────────────────────

private fun testHistoryItem(
    guid: String = "guid-1",
    title: String = "Episode Title",
    podcastTitle: String = "Podcast Name",
    positionSeconds: Int = 600,
    positionPct: Float? = 0.5f,
    completed: Boolean = false,
    updatedAt: String = "2020-01-01T00:00:00Z",
) = HistoryItem(
    guid = guid,
    feedUrl = "https://feed.example.com",
    positionSeconds = positionSeconds,
    positionPct = positionPct,
    completed = completed,
    updatedAt = updatedAt,
    title = title,
    podcastTitle = podcastTitle,
    artworkUrl = null,
    audioUrl = "https://audio.example.com/episode.mp3",
    durationSeconds = 3600,
)
