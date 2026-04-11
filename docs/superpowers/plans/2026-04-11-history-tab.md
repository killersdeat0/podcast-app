# History Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a History tab to the SyncPods mobile app that shows a user's listening history grouped by recency (Today / This Week / Earlier), with an In Progress sub-tab, visible only when authenticated.

**Architecture:** Full UDF pipeline (`HistoryFeature` → `HistoryScreen` → `HistoryViewModel` → `HistoryRepository`) following the established `StandardFeature` pattern. Auth-conditional tab in `AppShell` animates in/out with `AnimatedVisibility` driven by `sessionStatus`. `SupabaseHistoryRepository` queries `playback_progress` → `episodes` → `subscriptions` directly, matching web API logic.

**Tech Stack:** Kotlin Multiplatform · Compose Multiplatform · `io.github.reid-mcpherson:arch:1.0.2` · supabase-kt (postgrest) · kotlinx.datetime · Turbine (tests) · Koin DI

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryRepository.kt` | **Create** | `HistoryItem`, `DateGroup`, `isInProgress()`, `HistoryRepository` interface, `SupabaseHistoryRepository` |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryFeature.kt` | **Create** | STATE, EVENT, ACTION, RESULT, EFFECT sealed types + `StandardFeature` subclass + `groupByDate()` |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryViewModel.kt` | **Create** | Thin `ViewModel` wrapper |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt` | **Create** | Composable UI: header with tab pills, grouped list, episode rows |
| `composeApp/src/commonTest/kotlin/com/trilium/syncpods/history/HistoryFeatureTest.kt` | **Create** | Feature tests with `FakeHistoryRepository` |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/navigation/AppRoutes.kt` | **Modify** | Add `History` route |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt` | **Modify** | Auth-conditional animated tab + NavHost entry |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt` | **Modify** | Register `HistoryRepository` and `HistoryViewModel` |

---

## Task 1: HistoryRepository — data models, interface, Supabase implementation

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryRepository.kt`

- [ ] **Step 1: Create the file**

```kotlin
package com.trilium.syncpods.history

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Domain model ──────────────────────────────────────────────────────────────

data class HistoryItem(
    val guid: String,
    val feedUrl: String,
    val positionSeconds: Int,
    val positionPct: Float?,
    val completed: Boolean,
    val updatedAt: String,         // ISO8601
    val title: String,
    val podcastTitle: String,
    val artworkUrl: String?,
    val audioUrl: String,
    val durationSeconds: Int?,
)

data class DateGroup(val label: String, val items: List<HistoryItem>)

/** Matches web constants.ts: started (>30s), not completed, under 98% */
fun HistoryItem.isInProgress(): Boolean =
    !completed && positionSeconds > 30 && positionPct != null && positionPct < 98f

// ── Interface ─────────────────────────────────────────────────────────────────

interface HistoryRepository {
    suspend fun getHistory(isFreeTier: Boolean): List<HistoryItem>
}

// ── Serializable row types ────────────────────────────────────────────────────

@Serializable
private data class PlaybackProgressRow(
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position_seconds") val positionSeconds: Int,
    @SerialName("position_pct") val positionPct: Float? = null,
    @SerialName("completed") val completed: Boolean = false,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
private data class EpisodeRow(
    @SerialName("guid") val guid: String,
    @SerialName("title") val title: String? = null,
    @SerialName("audio_url") val audioUrl: String? = null,
    @SerialName("duration") val duration: Int? = null,
    @SerialName("artwork_url") val artworkUrl: String? = null,
    @SerialName("podcast_title") val podcastTitle: String? = null,
)

@Serializable
private data class SubscriptionArtworkRow(
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("artwork_url") val artworkUrl: String? = null,
)

// ── Supabase implementation ───────────────────────────────────────────────────

class SupabaseHistoryRepository(
    private val supabaseClient: SupabaseClient,
) : HistoryRepository {

    override suspend fun getHistory(isFreeTier: Boolean): List<HistoryItem> {
        val thirtyDaysAgoIso = Instant.fromEpochMilliseconds(
            Clock.System.now().toEpochMilliseconds() - 30L * 24 * 60 * 60 * 1000
        ).toString()

        val progressRows = supabaseClient.from("playback_progress").select(
            Columns.list("episode_guid", "feed_url", "position_seconds", "position_pct", "completed", "updated_at")
        ) {
            filter {
                gt("position_seconds", 0)
                if (isFreeTier) gte("updated_at", thirtyDaysAgoIso)
            }
            order("updated_at", order = Order.DESCENDING)
        }.decodeList<PlaybackProgressRow>()

        if (progressRows.isEmpty()) return emptyList()

        val guids = progressRows.map { it.episodeGuid }
        val feedUrls = progressRows.map { it.feedUrl }.distinct()

        return coroutineScope {
            val episodesDeferred = async {
                supabaseClient.from("episodes").select(
                    Columns.list("guid", "title", "audio_url", "duration", "artwork_url", "podcast_title")
                ) {
                    filter { isIn("guid", guids) }
                }.decodeList<EpisodeRow>()
            }
            val subscriptionsDeferred = async {
                supabaseClient.from("subscriptions").select(
                    Columns.list("feed_url", "artwork_url")
                ) {
                    filter { isIn("feed_url", feedUrls) }
                }.decodeList<SubscriptionArtworkRow>()
            }

            val episodeMap = episodesDeferred.await().associateBy { it.guid }
            val subArtworkMap = subscriptionsDeferred.await().associate { it.feedUrl to it.artworkUrl }

            progressRows.mapNotNull { row ->
                val ep = episodeMap[row.episodeGuid] ?: return@mapNotNull null
                val audioUrl = ep.audioUrl ?: return@mapNotNull null
                HistoryItem(
                    guid = row.episodeGuid,
                    feedUrl = row.feedUrl,
                    positionSeconds = row.positionSeconds,
                    positionPct = row.positionPct,
                    completed = row.completed,
                    updatedAt = row.updatedAt,
                    title = ep.title ?: "",
                    podcastTitle = ep.podcastTitle ?: "",
                    artworkUrl = subArtworkMap[row.feedUrl] ?: ep.artworkUrl,
                    audioUrl = audioUrl,
                    durationSeconds = ep.duration,
                )
            }
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryRepository.kt
git commit -m "feat: add HistoryRepository with data model and Supabase impl"
```

---

## Task 2: HistoryFeature — TDD (types → failing tests → implementation)

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryFeature.kt`
- Create: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/history/HistoryFeatureTest.kt`

- [ ] **Step 1: Create `HistoryFeature.kt` with types only (no StandardFeature impl yet)**

This lets the test file compile before the implementation is complete.

```kotlin
package com.trilium.syncpods.history

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

// ── State ─────────────────────────────────────────────────────────────────────

enum class HistoryTab { All, InProgress }

data class HistoryState(
    val allGroups: List<DateGroup> = emptyList(),
    val inProgressItems: List<HistoryItem> = emptyList(),
    val activeTab: HistoryTab = HistoryTab.All,
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class HistoryEvent {
    data object ScreenVisible : HistoryEvent()
    data object RetryTapped : HistoryEvent()
    data class TabSelected(val tab: HistoryTab) : HistoryEvent()
    data class EpisodeTapped(val item: HistoryItem) : HistoryEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class HistoryAction {
    data object Load : HistoryAction()
    data class SwitchTab(val tab: HistoryTab) : HistoryAction()
    data class PlayEpisode(val item: HistoryItem) : HistoryAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class HistoryResult {
    data object Loading : HistoryResult()
    data class Loaded(val items: List<HistoryItem>) : HistoryResult()
    data class LoadError(val message: String) : HistoryResult()
    data class TabSwitched(val tab: HistoryTab) : HistoryResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class HistoryEffect {
    data class PlayEpisode(val item: HistoryItem) : HistoryEffect()
}

// ── Feature (stub — fill in next step) ───────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class HistoryFeature(
    scope: CoroutineScope,
    private val repository: HistoryRepository,
    private val profileRepository: ProfileRepository,
) : StandardFeature<HistoryState, HistoryEvent, HistoryAction, HistoryResult, HistoryEffect>(scope) {

    private val _effects = MutableSharedFlow<HistoryEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<HistoryEffect> get() = _effects

    override val initial = HistoryState()

    override val eventToAction: Interactor<HistoryEvent, HistoryAction> = { events ->
        merge(
            events.filterIsInstance<HistoryEvent.ScreenVisible>().map { HistoryAction.Load },
            events.filterIsInstance<HistoryEvent.RetryTapped>().map { HistoryAction.Load },
            events.filterIsInstance<HistoryEvent.TabSelected>().map { HistoryAction.SwitchTab(it.tab) },
            events.filterIsInstance<HistoryEvent.EpisodeTapped>().map { HistoryAction.PlayEpisode(it.item) },
        )
    }

    override val actionToResult: Interactor<HistoryAction, HistoryResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is HistoryAction.Load -> flowOf(HistoryResult.Loading) // stub
                is HistoryAction.SwitchTab -> flowOf(HistoryResult.TabSwitched(action.tab))
                is HistoryAction.PlayEpisode -> flow { /* stub */ }
            }
        }
    }

    override suspend fun handleResult(previous: HistoryState, result: HistoryResult): HistoryState =
        when (result) {
            is HistoryResult.Loading -> previous.copy(isLoading = true, error = null)
            is HistoryResult.Loaded -> previous
            is HistoryResult.LoadError -> previous.copy(isLoading = false, error = result.message)
            is HistoryResult.TabSwitched -> previous.copy(activeTab = result.tab)
        }
}
```

- [ ] **Step 2: Create `HistoryFeatureTest.kt` with all tests**

```kotlin
package com.trilium.syncpods.history

import app.cash.turbine.test
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import com.trilium.syncpods.profile.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
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

            // Only "Earlier" group present — Today and This Week omitted
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
            assertEquals(callsBefore, repo.getHistoryCallCount) // no extra fetch

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits PlayEpisode effect when episode tapped`() = runTest {
        val item = testHistoryItem(guid = "ep-play")
        val repo = FakeHistoryRepository(items = listOf(item))
        val feature = HistoryFeature(backgroundScope, repo, FakeProfileRepository())

        // Load first so history is populated
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

            // Now fix the repo and retry
            repo.shouldThrow = false
            feature.process(HistoryEvent.RetryTapped)
            latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertNull(latest.error)

            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

private class FakeHistoryRepository(
    private val items: List<HistoryItem> = emptyList(),
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
```

- [ ] **Step 3: Run tests — expect failures**

```bash
cd /Users/personal/VisualStudioProjects/podcast-app/mobile
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.history.HistoryFeatureTest"
```

Expected: Several tests fail because `actionToResult` for `Load` is still a stub returning `Loading` only.

- [ ] **Step 4: Replace the stub `actionToResult` and `handleResult` in `HistoryFeature.kt` with the full implementation**

Replace the `actionToResult` property and `handleResult` function (and add the `groupByDate` private function at the bottom of the file):

```kotlin
    override val actionToResult: Interactor<HistoryAction, HistoryResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is HistoryAction.Load -> flow {
                    emit(HistoryResult.Loading)
                    try {
                        val tier = profileRepository.getUserTier()
                        val items = repository.getHistory(isFreeTier = tier == "free")
                        emit(HistoryResult.Loaded(items))
                    } catch (e: Exception) {
                        emit(HistoryResult.LoadError(e.message ?: "Failed to load history"))
                    }
                }
                is HistoryAction.SwitchTab -> flowOf(HistoryResult.TabSwitched(action.tab))
                is HistoryAction.PlayEpisode -> flow {
                    _effects.emit(HistoryEffect.PlayEpisode(action.item))
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: HistoryState,
        result: HistoryResult,
    ): HistoryState = when (result) {
        is HistoryResult.Loading -> previous.copy(isLoading = true, error = null)
        is HistoryResult.Loaded -> previous.copy(
            isLoading = false,
            error = null,
            allGroups = groupByDate(result.items),
            inProgressItems = result.items.filter { it.isInProgress() },
        )
        is HistoryResult.LoadError -> previous.copy(isLoading = false, error = result.message)
        is HistoryResult.TabSwitched -> previous.copy(activeTab = result.tab)
    }
}

// ── Date grouping ─────────────────────────────────────────────────────────────

private fun groupByDate(items: List<HistoryItem>): List<DateGroup> {
    val tz = TimeZone.currentSystemDefault()
    val now = Clock.System.now()
    val today = now.toLocalDateTime(tz).date
    val sevenDaysAgo = Instant.fromEpochMilliseconds(
        now.toEpochMilliseconds() - 7L * 24 * 60 * 60 * 1000
    )

    val todayItems = mutableListOf<HistoryItem>()
    val thisWeekItems = mutableListOf<HistoryItem>()
    val earlierItems = mutableListOf<HistoryItem>()

    for (item in items) {
        val itemInstant = Instant.parse(item.updatedAt)
        val itemDate = itemInstant.toLocalDateTime(tz).date
        when {
            itemDate == today -> todayItems.add(item)
            itemInstant >= sevenDaysAgo -> thisWeekItems.add(item)
            else -> earlierItems.add(item)
        }
    }

    return buildList {
        if (todayItems.isNotEmpty()) add(DateGroup("Today", todayItems))
        if (thisWeekItems.isNotEmpty()) add(DateGroup("This Week", thisWeekItems))
        if (earlierItems.isNotEmpty()) add(DateGroup("Earlier", earlierItems))
    }
}
```

The closing `}` on line before `groupByDate` closes the `HistoryFeature` class — make sure the class body ends before this private function.

- [ ] **Step 5: Run tests — expect all pass**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.history.HistoryFeatureTest"
```

Expected: `BUILD SUCCESSFUL` with all tests passing.

- [ ] **Step 6: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/history/HistoryFeatureTest.kt
git commit -m "feat: add HistoryFeature with UDF pipeline and tests"
```

---

## Task 3: HistoryViewModel

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryViewModel.kt`

- [ ] **Step 1: Create the file**

```kotlin
package com.trilium.syncpods.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class HistoryViewModel(
    repository: HistoryRepository,
    profileRepository: ProfileRepository,
) : ViewModel() {
    val feature = HistoryFeature(viewModelScope + Dispatchers.Default, repository, profileRepository)
}
```

- [ ] **Step 2: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryViewModel.kt
git commit -m "feat: add HistoryViewModel"
```

---

## Task 4: HistoryScreen

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt`

- [ ] **Step 1: Create the file**

```kotlin
package com.trilium.syncpods.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trilium.syncpods.player.NowPlaying

@Composable
fun HistoryScreen(
    feature: HistoryFeature,
    onPlayEpisode: (NowPlaying) -> Unit,
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()

    LaunchedEffect(Unit) {
        feature.process(HistoryEvent.ScreenVisible)
        feature.effects.collect { effect ->
            when (effect) {
                is HistoryEffect.PlayEpisode -> onPlayEpisode(
                    NowPlaying(
                        guid = effect.item.guid,
                        title = effect.item.title,
                        podcastName = effect.item.podcastTitle,
                        artworkUrl = effect.item.artworkUrl.orEmpty(),
                        audioUrl = effect.item.audioUrl,
                    )
                )
            }
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "History",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(12.dp))
            HistoryTabPill(
                label = "All",
                active = state.activeTab == HistoryTab.All,
                onClick = { feature.process(HistoryEvent.TabSelected(HistoryTab.All)) },
            )
            Spacer(Modifier.width(4.dp))
            HistoryTabPill(
                label = "In Progress",
                active = state.activeTab == HistoryTab.InProgress,
                onClick = { feature.process(HistoryEvent.TabSelected(HistoryTab.InProgress)) },
            )
        }

        when {
            state.isLoading -> HistoryLoadingContent()
            state.error != null -> HistoryErrorContent(
                message = state.error!!,
                onRetry = { feature.process(HistoryEvent.RetryTapped) },
            )
            state.activeTab == HistoryTab.All -> {
                if (state.allGroups.isEmpty()) {
                    HistoryEmptyState("No listening history yet.\nStart playing an episode to see it here.")
                } else {
                    HistoryAllContent(
                        groups = state.allGroups,
                        onEpisodeTapped = { feature.process(HistoryEvent.EpisodeTapped(it)) },
                        bottomContentPadding = bottomContentPadding,
                    )
                }
            }
            else -> {
                if (state.inProgressItems.isEmpty()) {
                    HistoryEmptyState("No episodes in progress.\nEpisodes you've started will appear here.")
                } else {
                    HistoryInProgressContent(
                        items = state.inProgressItems,
                        onEpisodeTapped = { feature.process(HistoryEvent.EpisodeTapped(it)) },
                        bottomContentPadding = bottomContentPadding,
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryTabPill(label: String, active: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        contentColor = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun HistoryAllContent(
    groups: List<DateGroup>,
    onEpisodeTapped: (HistoryItem) -> Unit,
    bottomContentPadding: Dp,
) {
    LazyColumn(
        contentPadding = PaddingValues(bottom = bottomContentPadding),
        modifier = Modifier.fillMaxSize(),
    ) {
        groups.forEach { group ->
            item(key = group.label) {
                val episodeWord = if (group.items.size == 1) "EPISODE" else "EPISODES"
                Text(
                    text = "${group.label.uppercase()} · ${group.items.size} $episodeWord",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
                )
            }
            items(group.items, key = { it.guid }) { item ->
                EpisodeRow(
                    item = item,
                    onTap = { onEpisodeTapped(item) },
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun HistoryInProgressContent(
    items: List<HistoryItem>,
    onEpisodeTapped: (HistoryItem) -> Unit,
    bottomContentPadding: Dp,
) {
    LazyColumn(
        contentPadding = PaddingValues(bottom = bottomContentPadding),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(items, key = { it.guid }) { item ->
            EpisodeRow(
                item = item,
                onTap = { onEpisodeTapped(item) },
                modifier = Modifier.padding(horizontal = 8.dp),
            )
        }
    }
}

@Composable
private fun EpisodeRow(item: HistoryItem, onTap: () -> Unit, modifier: Modifier = Modifier) {
    val isPlayed = item.completed || (item.positionPct != null && item.positionPct >= 98f)
    Card(
        onClick = onTap,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AsyncImage(
                model = item.artworkUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(8.dp)),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = item.podcastTitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    val duration = formatDuration(item.durationSeconds)
                    if (duration.isNotEmpty()) {
                        Text(
                            text = duration,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (isPlayed) {
                        Text(
                            text = "✓ PLAYED",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryLoadingContent() {
    Column(
        modifier = Modifier.fillMaxSize().padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(5) {
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.fillMaxWidth().height(72.dp),
            ) {}
        }
    }
}

@Composable
private fun HistoryErrorContent(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(8.dp))
        Button(onClick = onRetry) { Text("Retry") }
    }
}

@Composable
private fun HistoryEmptyState(message: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(32.dp),
        )
    }
}

private fun formatDuration(seconds: Int?): String {
    if (seconds == null || seconds == 0) return ""
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}
```

- [ ] **Step 2: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt
git commit -m "feat: add HistoryScreen composable"
```

---

## Task 5: Wire up navigation, AppShell, and DI

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/navigation/AppRoutes.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`

- [ ] **Step 1: Add History route to `AppRoutes.kt`**

Add one line inside the `AppRoutes` sealed class, after `Queue`:

```kotlin
data object History : AppRoutes("history")
```

Full file after change:

```kotlin
package com.trilium.syncpods.navigation

sealed class AppRoutes(val route: String) {
    data object Discover : AppRoutes("discover")
    data object Library : AppRoutes("library")
    data object Queue : AppRoutes("queue")
    data object History : AppRoutes("history")
    data object Profile : AppRoutes("profile")
    data class PodcastDetail(val feedUrl: String) : AppRoutes("podcast/{feedUrl}") {
        companion object {
            const val ROUTE = "podcast/{feedUrl}"
        }
    }
    data class Search(val query: String) : AppRoutes("search/{query}") {
        companion object {
            const val ROUTE = "search/{query}"
        }
    }
    data object Settings : AppRoutes("settings")
    data object Login : AppRoutes("login")
    data object ForgotPassword : AppRoutes("forgot-password")
    data object SignUp : AppRoutes("signup")
    data class VerifyEmail(val email: String) : AppRoutes("verify-email/{email}") {
        companion object {
            const val ROUTE = "verify-email/{email}"
        }
    }
}
```

- [ ] **Step 2: Update `AppShell.kt`**

Add these imports at the top of the file alongside the existing imports:

```kotlin
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.material.icons.filled.History
import com.trilium.syncpods.history.HistoryScreen
import com.trilium.syncpods.history.HistoryViewModel
```

Replace the `TabItem` data class definition (currently private, at the top of the file):

```kotlin
private data class TabItem(
    val route: String,
    val label: String,
    val icon: @Composable () -> Unit,
    val visible: Boolean = true,
)
```

Add auth-reactive state at the top of the `AppShell()` composable body, right after the existing `navController` and `navBackStackEntry` lines:

```kotlin
val sessionStatus by supabaseClient.auth.sessionStatus.collectAsState()
val isAuthenticated = sessionStatus is SessionStatus.Authenticated
```

Replace the `tabs` list with this version (History inserted between Queue and Profile, with `visible = isAuthenticated`):

```kotlin
val tabs = listOf(
    TabItem(AppRoutes.Discover.route, "Discover") {
        Icon(Icons.Default.Search, contentDescription = "Discover")
    },
    TabItem(AppRoutes.Library.route, "Library") {
        Icon(Icons.Default.Star, contentDescription = "Library")
    },
    TabItem(AppRoutes.Queue.route, "Queue") {
        Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Queue")
    },
    TabItem(AppRoutes.History.route, "History", visible = isAuthenticated) {
        Icon(Icons.Default.History, contentDescription = "History")
    },
    TabItem(AppRoutes.Profile.route, "Profile") {
        Icon(Icons.Default.Person, contentDescription = "Profile")
    },
)
```

Replace the `NavigationBar { tabs.forEach { tab -> NavigationBarItem(...) } }` block with this version that wraps each item in `AnimatedVisibility`:

```kotlin
NavigationBar {
    tabs.forEach { tab ->
        AnimatedVisibility(
            visible = tab.visible,
            enter = fadeIn() + expandHorizontally(),
            exit = fadeOut() + shrinkHorizontally(),
        ) {
            NavigationBarItem(
                selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true,
                onClick = {
                    navController.navigate(tab.route) {
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = tab.icon,
                label = { Text(tab.label) },
            )
        }
    }
}
```

Add History composable inside `NavHost`, after the Queue composable entry:

```kotlin
composable(AppRoutes.History.route) {
    val viewModel = koinViewModel<HistoryViewModel>()
    HistoryScreen(
        feature = viewModel.feature,
        onPlayEpisode = onPlayEpisode,
        modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
        bottomContentPadding = innerPadding.calculateBottomPadding(),
    )
}
```

- [ ] **Step 3: Register in `AppModule.kt`**

Add these two lines inside the `appModule` block, after the `SettingsRepository` registration:

```kotlin
single<HistoryRepository> { SupabaseHistoryRepository(supabaseClient = get()) }
viewModel { HistoryViewModel(get(), get()) }
```

Also add the missing imports at the top of `AppModule.kt`:

```kotlin
import com.trilium.syncpods.history.HistoryRepository
import com.trilium.syncpods.history.HistoryViewModel
import com.trilium.syncpods.history.SupabaseHistoryRepository
```

- [ ] **Step 4: Build to verify no compilation errors**

```bash
cd /Users/personal/VisualStudioProjects/podcast-app/mobile
./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. If `Icons.Default.History` is unresolved (unlikely — `compose.materialIconsExtended` is already in dependencies), replace with `Icons.Default.AccessTime` as a fallback.

- [ ] **Step 5: Run all tests to confirm nothing is broken**

```bash
./gradlew :composeApp:allTests
```

Expected: `BUILD SUCCESSFUL` with all tests passing.

- [ ] **Step 6: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/navigation/AppRoutes.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt
git commit -m "feat: wire History tab into navigation, AppShell, and DI"
```
