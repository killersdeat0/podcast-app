# Mobile Playback Progress Saving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save playback progress to Supabase during audio playback on mobile, matching web behavior, so the History tab reflects played episodes.

**Architecture:** Three save paths matching `Player.tsx`: (1) switch-away save when the episode changes, (2) 10-second periodic save while playing, (3) 98%-completion mark. A new `ProgressRepository` owns all Supabase writes (`playback_progress`, `episodes` cache, `listening_daily`/`listening_by_show` stats). `PlayerFeature` gains a periodic coroutine launched on its own scope and cancelled/restarted on play/pause/resume. `AudioPlayer` gains two new methods to read current position and duration from the platform player.

**Tech Stack:** Kotlin Multiplatform · supabase-kt (postgrest) · ExoPlayer (Android) · AVPlayer (iOS) · kotlinx-coroutines-test (virtual time for periodic-save tests)

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `player/NowPlaying.kt` | Modify | Add `feedUrl: String`, `durationSeconds: Int?` |
| `player/AudioPlayer.kt` | Modify | Add `suspend fun currentPositionSeconds(): Int`, `suspend fun durationSeconds(): Int?` |
| `player/AndroidAudioPlayer.kt` | Modify | Implement new methods using ExoPlayer (`currentPosition`/`duration`, both in ms → convert to seconds) |
| `player/IOSAudioPlayer.kt` | Modify | Implement new methods using `AVPlayer.currentTime()` / `currentItem.duration` (CMTime → seconds) |
| `player/ProgressRepository.kt` | Create | `ProgressRepository` interface + `SupabaseProgressRepository` (upserts to `playback_progress`, `episodes`, `listening_daily`, `listening_by_show`) |
| `player/PlayerFeature.kt` | Modify | Inject `ProgressRepository` + `ProfileRepository`; add switch-away save, 10s periodic coroutine, 98% completion mark |
| `player/PlayerViewModel.kt` | Modify | Accept and wire `ProgressRepository` + `ProfileRepository` |
| `podcastdetail/PodcastDetailFeature.kt` | Modify | Add `feedUrl: String` to `PodcastDetailState` |
| `queue/QueueScreen.kt` | Modify | Pass `feedUrl`, `durationSeconds` in `NowPlaying(...)` construction |
| `history/HistoryScreen.kt` | Modify | Pass `feedUrl`, `durationSeconds` in `NowPlaying(...)` construction |
| `podcastdetail/PodcastDetailScreen.kt` | Modify | Pass `feedUrl`, `durationSeconds` in `NowPlaying(...)` construction |
| `di/AppModule.kt` | Modify | Register `ProgressRepository`; update `PlayerViewModel` injection |
| `commonTest/.../player/PlayerFeatureTest.kt` | Create | TDD tests for all three save paths |

---

## Task 1: Extend `NowPlaying` with `feedUrl` and `durationSeconds`

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/NowPlaying.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/queue/QueueScreen.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/podcastdetail/PodcastDetailScreen.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/podcastdetail/PodcastDetailFeature.kt`

- [ ] **Step 1: Update `NowPlaying.kt`**

Replace the entire file:

```kotlin
package com.trilium.syncpods.player

data class NowPlaying(
    val guid: String,
    val title: String,
    val podcastName: String,
    val artworkUrl: String,
    val audioUrl: String,
    val feedUrl: String,
    val durationSeconds: Int?,
)
```

- [ ] **Step 2: Add `feedUrl` to `PodcastDetailState`**

In `PodcastDetailFeature.kt`, add `feedUrl: String = ""` to `PodcastDetailState`:

```kotlin
data class PodcastDetailState(
    val feedUrl: String = "",           // ← add this line
    val podcastTitle: String = "",
    val artistName: String = "",
    val artworkUrl: String = "",
    // ... rest unchanged
)
```

Then find where `PodcastDetailState` is first populated in `handleResult` — look for the result that sets `podcastTitle` and add `feedUrl` assignment there. The `feedUrl` comes from the `PodcastDetailFeature` constructor parameter (it's passed in as the route argument). Confirm how it reaches state by reading the constructor and `actionToResult` for `LoadScreen`.

- [ ] **Step 3: Update `QueueScreen.kt` NowPlaying construction**

In `QueueScreen.kt`, the `NowPlaying` construction inside the `QueueEffect.PlayEpisode` handler (around line 75) currently has 5 fields. `effect.item` is a `QueueItem` which has both `feedUrl` and `durationSeconds`. Add them:

```kotlin
is QueueEffect.PlayEpisode -> onPlayEpisode(
    NowPlaying(
        guid = effect.item.guid,
        title = effect.item.title,
        podcastName = effect.item.podcastTitle,
        artworkUrl = effect.item.artworkUrl.orEmpty(),
        audioUrl = effect.item.audioUrl,
        feedUrl = effect.item.feedUrl,
        durationSeconds = effect.item.durationSeconds,
    )
)
```

- [ ] **Step 4: Update `HistoryScreen.kt` NowPlaying construction**

In `HistoryScreen.kt`, the `NowPlaying` construction inside the `HistoryEffect.PlayEpisode` handler (around line 52). `effect.item` is a `HistoryItem` which has `feedUrl` and `durationSeconds`:

```kotlin
is HistoryEffect.PlayEpisode -> onPlayEpisode(
    NowPlaying(
        guid = effect.item.guid,
        title = effect.item.title,
        podcastName = effect.item.podcastTitle,
        artworkUrl = effect.item.artworkUrl.orEmpty(),
        audioUrl = effect.item.audioUrl,
        feedUrl = effect.item.feedUrl,
        durationSeconds = effect.item.durationSeconds,
    )
)
```

- [ ] **Step 5: Update `PodcastDetailScreen.kt` NowPlaying constructions**

There are two `NowPlaying(...)` calls in `PodcastDetailScreen.kt`. `Episode.duration` is the field name (not `durationSeconds`). The feed URL is now in `feature.state.value.feedUrl`.

First call (`PlayEpisode` effect, around line 107):

```kotlin
is PodcastDetailEffect.PlayEpisode -> onPlayEpisode(
    NowPlaying(
        guid = effect.episode.guid,
        title = effect.episode.title,
        podcastName = feature.state.value.podcastTitle,
        artworkUrl = feature.state.value.artworkUrl,
        audioUrl = effect.episode.audioUrl,
        feedUrl = feature.state.value.feedUrl,
        durationSeconds = effect.episode.duration,
    )
)
```

Second call (`PlayLatest` effect, around line 119):

```kotlin
is PodcastDetailEffect.PlayLatest -> {
    val s = feature.state.value
    val episode = if (s.sortNewestFirst) s.episodes.firstOrNull() else s.episodes.lastOrNull()
    if (episode != null) {
        onPlayEpisode(
            NowPlaying(
                guid = episode.guid,
                title = episode.title,
                podcastName = s.podcastTitle,
                artworkUrl = s.artworkUrl,
                audioUrl = episode.audioUrl,
                feedUrl = s.feedUrl,
                durationSeconds = episode.duration,
            )
        )
    }
}
```

- [ ] **Step 6: Build to verify no compilation errors**

```bash
cd /Users/personal/VisualStudioProjects/podcast-app/mobile
./gradlew :composeApp:compileDebugKotlinAndroid
```

Expected: `BUILD SUCCESSFUL` (no errors — only the pre-existing `Instant` deprecation warning).

- [ ] **Step 7: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/NowPlaying.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/queue/QueueScreen.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/podcastdetail/PodcastDetailScreen.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/podcastdetail/PodcastDetailFeature.kt
git commit -m "feat: add feedUrl and durationSeconds to NowPlaying"
```

---

## Task 2: Add `currentPositionSeconds()` and `durationSeconds()` to `AudioPlayer`

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/AudioPlayer.kt`
- Modify: `composeApp/src/androidMain/kotlin/com/trilium/syncpods/player/AndroidAudioPlayer.kt`
- Modify: `composeApp/src/iosMain/kotlin/com/trilium/syncpods/player/IOSAudioPlayer.kt`

- [ ] **Step 1: Update `AudioPlayer.kt` interface**

```kotlin
package com.trilium.syncpods.player

interface AudioPlayer {
    suspend fun play(url: String)
    suspend fun pause()
    suspend fun resume()
    suspend fun stop()
    suspend fun currentPositionSeconds(): Int
    suspend fun durationSeconds(): Int?
}
```

- [ ] **Step 2: Implement in `AndroidAudioPlayer.kt`**

ExoPlayer's `currentPosition` and `duration` are in milliseconds and must be read on the main thread:

```kotlin
package com.trilium.syncpods.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidAudioPlayer(private val context: Context) : AudioPlayer {

    private var player: ExoPlayer? = null

    override suspend fun play(url: String) = withContext(Dispatchers.Main) {
        player?.release()
        val exo = ExoPlayer.Builder(context).build().also { player = it }
        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()
        exo.play()
    }

    override suspend fun pause() = withContext(Dispatchers.Main) {
        player?.pause()
        Unit
    }

    override suspend fun resume() = withContext(Dispatchers.Main) {
        player?.play()
        Unit
    }

    override suspend fun stop() = withContext(Dispatchers.Main) {
        player?.stop()
        player?.release()
        player = null
    }

    override suspend fun currentPositionSeconds(): Int = withContext(Dispatchers.Main) {
        ((player?.currentPosition ?: 0L) / 1000L).toInt()
    }

    override suspend fun durationSeconds(): Int? = withContext(Dispatchers.Main) {
        val ms = player?.duration ?: return@withContext null
        if (ms <= 0L) null else (ms / 1000L).toInt()
    }
}
```

- [ ] **Step 3: Implement in `IOSAudioPlayer.kt`**

`AVPlayer.currentTime()` returns a `CMTime`. `CMTimeGetSeconds` converts it to a `Double`:

```kotlin
package com.trilium.syncpods.player

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import platform.AVFoundation.AVPlayer
import platform.AVFoundation.pause
import platform.AVFoundation.play
import platform.CoreMedia.CMTimeGetSeconds
import platform.Foundation.NSURL

class IOSAudioPlayer : AudioPlayer {

    private var player: AVPlayer? = null

    override suspend fun play(url: String) = withContext(Dispatchers.Main) {
        val nsUrl = NSURL.URLWithString(url) ?: return@withContext
        player = AVPlayer(uRL = nsUrl)
        player?.play()
        Unit
    }

    override suspend fun pause() = withContext(Dispatchers.Main) {
        player?.pause()
        Unit
    }

    override suspend fun resume() = withContext(Dispatchers.Main) {
        player?.play()
        Unit
    }

    override suspend fun stop() = withContext(Dispatchers.Main) {
        player?.pause()
        player = null
    }

    override suspend fun currentPositionSeconds(): Int = withContext(Dispatchers.Main) {
        val time = player?.currentTime() ?: return@withContext 0
        maxOf(0, CMTimeGetSeconds(time).toInt())
    }

    override suspend fun durationSeconds(): Int? = withContext(Dispatchers.Main) {
        val item = player?.currentItem ?: return@withContext null
        val seconds = CMTimeGetSeconds(item.duration).toInt()
        if (seconds <= 0) null else seconds
    }
}
```

- [ ] **Step 4: Build to verify**

```bash
./gradlew :composeApp:compileDebugKotlinAndroid
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/AudioPlayer.kt \
        composeApp/src/androidMain/kotlin/com/trilium/syncpods/player/AndroidAudioPlayer.kt \
        composeApp/src/iosMain/kotlin/com/trilium/syncpods/player/IOSAudioPlayer.kt
git commit -m "feat: add currentPositionSeconds and durationSeconds to AudioPlayer"
```

---

## Task 3: `ProgressRepository` — interface + Supabase implementation

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/ProgressRepository.kt`

`SupabaseProgressRepository` mirrors the web's `/api/progress` POST handler. It upserts to four tables: `episodes` (metadata cache), `playback_progress` (what History reads), `listening_daily`, and `listening_by_show` (stats). The time-delta for stats is computed from an in-memory `lastSaveInstant` rather than a DB read, which avoids an extra network round-trip on every save.

No unit tests for this file — it's a direct Supabase adapter. Correct behavior is verified by the integration (History showing episodes after playback in Task 5 verification).

- [ ] **Step 1: Create `ProgressRepository.kt`**

```kotlin
package com.trilium.syncpods.player

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import kotlin.time.Clock
import kotlin.time.Instant
import kotlin.time.Duration.Companion.seconds

// ── Interface ─────────────────────────────────────────────────────────────────

interface ProgressRepository {
    /**
     * Persist playback progress to Supabase.
     * [positionSeconds] is the current audio position.
     * [completed] should be true only when position has reached ≥ 98% of duration.
     * No-op if the user is not authenticated.
     */
    suspend fun saveProgress(
        nowPlaying: NowPlaying,
        positionSeconds: Int,
        completed: Boolean,
    )
}

// ── Supabase implementation ───────────────────────────────────────────────────

class SupabaseProgressRepository(
    private val supabaseClient: SupabaseClient,
) : ProgressRepository {

    private val STATS_CAP_SECONDS = 15
    private var lastSaveInstant: Instant? = null

    override suspend fun saveProgress(
        nowPlaying: NowPlaying,
        positionSeconds: Int,
        completed: Boolean,
    ) {
        val userId = supabaseClient.auth.currentUserOrNull()?.id ?: return

        // Compute position percentage (0–100 scale, matching web)
        val positionPct: Float? = nowPlaying.durationSeconds
            ?.takeIf { it > 0 }
            ?.let { dur -> (positionSeconds.toFloat() / dur.toFloat() * 100f).coerceIn(0f, 100f) }

        // Upsert episode metadata so History can display title, artwork, etc.
        supabaseClient.from("episodes").upsert(
            mapOf(
                "feed_url" to nowPlaying.feedUrl,
                "guid" to nowPlaying.guid,
                "title" to nowPlaying.title,
                "audio_url" to nowPlaying.audioUrl,
                "duration" to nowPlaying.durationSeconds,
                "artwork_url" to nowPlaying.artworkUrl.ifEmpty { null },
                "podcast_title" to nowPlaying.podcastName,
            ),
        ) {
            onConflict = "feed_url,guid"
        }

        // Upsert playback progress (what History reads)
        supabaseClient.from("playback_progress").upsert(
            mapOf(
                "user_id" to userId,
                "episode_guid" to nowPlaying.guid,
                "feed_url" to nowPlaying.feedUrl,
                "position_seconds" to positionSeconds,
                "position_pct" to positionPct,
                "completed" to completed,
                "updated_at" to Clock.System.now().toString(),
            ),
        ) {
            onConflict = "user_id,episode_guid"
        }

        // ── Stats ─────────────────────────────────────────────────────────────
        // Compute seconds listened since the last save. Cap at 15s to avoid
        // inflating stats when the user pauses for a long time and then saves.
        val now = Clock.System.now()
        val secondsListened = lastSaveInstant
            ?.let { last -> ((now - last).inWholeSeconds).toInt().coerceIn(0, STATS_CAP_SECONDS) }
            ?: 0
        lastSaveInstant = now

        if (secondsListened > 0) {
            val today = now.toString().substring(0, 10) // "YYYY-MM-DD" UTC

            // listening_daily: read + increment seconds_listened for today
            val dailyRow = supabaseClient.from("listening_daily").select {
                filter {
                    eq("user_id", userId)
                    eq("date", today)
                }
            }.decodeSingleOrNull<Map<String, Long>>()

            supabaseClient.from("listening_daily").upsert(
                mapOf(
                    "user_id" to userId,
                    "date" to today,
                    "seconds_listened" to ((dailyRow?.get("seconds_listened") ?: 0L) + secondsListened),
                ),
            ) {
                onConflict = "user_id,date"
            }

            // listening_by_show: read + increment
            val showRow = supabaseClient.from("listening_by_show").select {
                filter {
                    eq("user_id", userId)
                    eq("feed_url", nowPlaying.feedUrl)
                }
            }.decodeSingleOrNull<Map<String, Long>>()

            supabaseClient.from("listening_by_show").upsert(
                mapOf(
                    "user_id" to userId,
                    "feed_url" to nowPlaying.feedUrl,
                    "seconds_listened" to ((showRow?.get("seconds_listened") ?: 0L) + secondsListened),
                    "episodes_completed" to ((showRow?.get("episodes_completed") ?: 0L) + if (completed) 1L else 0L),
                    "last_listened_at" to now.toString(),
                ),
            ) {
                onConflict = "user_id,feed_url"
            }
        } else if (completed) {
            // No time delta (first save or clock skew), but still a new completion —
            // increment episodes_completed only.
            val showRow = supabaseClient.from("listening_by_show").select {
                filter {
                    eq("user_id", userId)
                    eq("feed_url", nowPlaying.feedUrl)
                }
            }.decodeSingleOrNull<Map<String, Long>>()

            supabaseClient.from("listening_by_show").upsert(
                mapOf(
                    "user_id" to userId,
                    "feed_url" to nowPlaying.feedUrl,
                    "seconds_listened" to (showRow?.get("seconds_listened") ?: 0L),
                    "episodes_completed" to ((showRow?.get("episodes_completed") ?: 0L) + 1L),
                    "last_listened_at" to Clock.System.now().toString(),
                ),
            ) {
                onConflict = "user_id,feed_url"
            }
        }
    }
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
./gradlew :composeApp:compileDebugKotlinAndroid
```

Expected: `BUILD SUCCESSFUL`. If `decodeSingleOrNull` or `onConflict` syntax doesn't match the supabase-kt version in use, check `HistoryRepository.kt` and `QueueRepository.kt` for the correct upsert and select pattern and adjust accordingly.

- [ ] **Step 3: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/ProgressRepository.kt
git commit -m "feat: add ProgressRepository with Supabase progress and stats upserts"
```

---

## Task 4: `PlayerFeature` — three save paths (TDD)

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerFeature.kt`
- Create: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/player/PlayerFeatureTest.kt`

**Design:**
- `PlayerFeature` stores `private val featureScope = scope` to launch the periodic save coroutine outside the `flatMapLatest` flow.
- `private var hasCompleted = false` — internal flag; reset when a new episode starts; set to true after the 98% save fires.
- `private var periodicSaveJob: Job? = null` — cancelled and restarted as play/pause/resume cycle.
- Three paths:
  1. **Switch-away save** (`Play` action): if a previous episode was playing and `!hasCompleted` and `position > 5s` → save `completed=false` before starting new episode.
  2. **Periodic save** (runs every 10s while playing): if `!isGuest && !hasCompleted && position > 5s` → save `completed=false`. If position ≥ 98% → save `completed=true`, set `hasCompleted=true`, stop loop.
  3. Neither save fires if guest.
- `Pause` action: cancel `periodicSaveJob`, no save (matches web — `timeupdate` doesn't fire when paused).
- `Resume` action: restart `periodicSaveJob`.

- [ ] **Step 1: Create `PlayerFeatureTest.kt` with failing tests**

```kotlin
package com.trilium.syncpods.player

import app.cash.turbine.test
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import com.trilium.syncpods.profile.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PlayerFeatureTest {

    @Test
    fun `10s periodic save fires while playing`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(10_001)

        assertEquals(1, progress.saveCalls.size)
        assertEquals("ep1", progress.saveCalls[0].first.guid)
        assertFalse(progress.saveCalls[0].third) // completed = false
    }

    @Test
    fun `periodic save does not fire when position is 5s or less`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 5, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(10_001)

        assertEquals(0, progress.saveCalls.size)
    }

    @Test
    fun `periodic save fires multiple times every 10s`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(30_001)

        assertEquals(3, progress.saveCalls.size)
    }

    @Test
    fun `periodic save marks complete at 98 percent and stops further saves`() = runTest {
        // 3528 / 3600 = 98%
        val audio = FakeAudioPlayer(positionSeconds = 3528, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(10_001)

        assertEquals(1, progress.saveCalls.size)
        assertTrue(progress.saveCalls[0].third)   // completed = true

        // No more saves after completion
        advanceTimeBy(10_001)
        assertEquals(1, progress.saveCalls.size)
    }

    @Test
    fun `switch-away save fires for previous episode when new episode starts`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 120, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        feature.process(PlayerEvent.Play(testEpisode("ep2")))

        val switchAwaySave = progress.saveCalls.first { it.first.guid == "ep1" }
        assertFalse(switchAwaySave.third) // completed = false
    }

    @Test
    fun `switch-away save does not fire when position is 5s or less`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 3, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        feature.process(PlayerEvent.Play(testEpisode("ep2")))

        val ep1Saves = progress.saveCalls.filter { it.first.guid == "ep1" }
        assertEquals(0, ep1Saves.size)
    }

    @Test
    fun `switch-away save does not fire when already completed`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 3528, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        // First episode reaches completion
        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(10_001) // triggers completion save

        // Switch to new episode — should NOT save ep1 again
        val savesBeforeSwitch = progress.saveCalls.size
        feature.process(PlayerEvent.Play(testEpisode("ep2")))

        val ep1Saves = progress.saveCalls.filter { it.first.guid == "ep1" }
        assertEquals(savesBeforeSwitch, ep1Saves.size)
    }

    @Test
    fun `periodic save does not fire when guest`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository(isGuest = true))

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(10_001)

        assertEquals(0, progress.saveCalls.size)
    }

    @Test
    fun `periodic save stops when episode changes`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(5_000)
        feature.process(PlayerEvent.Play(testEpisode("ep2")))
        advanceTimeBy(5_001) // would be 10s for ep1's timer but it's been cancelled

        // ep1 had no saves from the periodic timer (cancelled before 10s elapsed)
        val ep1PeriodicSaves = progress.saveCalls.filter { it.first.guid == "ep1" }
        assertEquals(0, ep1PeriodicSaves.size)
    }

    @Test
    fun `pause cancels periodic save and resume restarts it`() = runTest {
        val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
        val progress = FakeProgressRepository()
        val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        advanceTimeBy(5_000)
        feature.process(PlayerEvent.PauseToggled) // pause at 5s — periodic timer cancelled

        // Advance another 10s — timer is cancelled, no saves
        advanceTimeBy(10_001)
        assertEquals(0, progress.saveCalls.size)

        // Resume — timer restarts
        feature.process(PlayerEvent.PauseToggled) // resume
        advanceTimeBy(10_001)
        assertEquals(1, progress.saveCalls.size)
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

private class FakeAudioPlayer(
    private val positionSeconds: Int = 0,
    private val durationSeconds: Int? = null,
) : AudioPlayer {
    override suspend fun play(url: String) {}
    override suspend fun pause() {}
    override suspend fun resume() {}
    override suspend fun stop() {}
    override suspend fun currentPositionSeconds(): Int = positionSeconds
    override suspend fun durationSeconds(): Int? = durationSeconds
}

private class FakeProgressRepository : ProgressRepository {
    // Triple<NowPlaying, positionSeconds, completed>
    val saveCalls = mutableListOf<Triple<NowPlaying, Int, Boolean>>()
    override suspend fun saveProgress(nowPlaying: NowPlaying, positionSeconds: Int, completed: Boolean) {
        saveCalls.add(Triple(nowPlaying, positionSeconds, completed))
    }
}

private class FakeProfileRepository(private val isGuest: Boolean = false) : ProfileRepository {
    override fun isGuest(): Boolean = isGuest
    override fun authStateChanges(): Flow<Unit> = emptyFlow()
    override suspend fun getUserTier(): String = if (isGuest) "free" else "paid"
    override suspend fun getUserProfile() = UserProfile("", "", if (isGuest) "free" else "paid")
    override suspend fun getSubscriptions() = emptyList<SubscriptionSummary>()
}

// ── Test helpers ──────────────────────────────────────────────────────────────

private fun testEpisode(guid: String) = NowPlaying(
    guid = guid,
    title = "Episode $guid",
    podcastName = "Test Podcast",
    artworkUrl = "https://art.example.com/cover.jpg",
    audioUrl = "https://audio.example.com/$guid.mp3",
    feedUrl = "https://feed.example.com/rss",
    durationSeconds = 3600,
)
```

- [ ] **Step 2: Run tests — expect compile failure (PlayerFeature doesn't accept new dependencies yet)**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.player.PlayerFeatureTest"
```

Expected: compile error — `PlayerFeature` constructor doesn't accept `ProgressRepository` or `ProfileRepository` yet.

- [ ] **Step 3: Update `PlayerFeature.kt` with full implementation**

Replace the entire file:

```kotlin
package com.trilium.syncpods.player

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch

private const val SAVE_INTERVAL_MS = 10_000L
private const val MIN_POSITION_TO_SAVE_SECONDS = 5
private const val COMPLETION_THRESHOLD_PCT = 98f

// ── State ─────────────────────────────────────────────────────────────────────

data class PlayerState(
    val nowPlaying: NowPlaying? = null,
    val isPlaying: Boolean = false,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class PlayerEvent {
    data class Play(val episode: NowPlaying) : PlayerEvent()
    data object PauseToggled : PlayerEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class PlayerAction {
    data class Play(val episode: NowPlaying) : PlayerAction()
    data object Pause : PlayerAction()
    data object Resume : PlayerAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class PlayerResult {
    data class NowPlayingSet(val episode: NowPlaying) : PlayerResult()
    data class PlaybackToggled(val isPlaying: Boolean) : PlayerResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class PlayerEffect

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class PlayerFeature(
    scope: CoroutineScope,
    private val audioPlayer: AudioPlayer,
    private val progressRepository: ProgressRepository,
    private val profileRepository: ProfileRepository,
) : StandardFeature<PlayerState, PlayerEvent, PlayerAction, PlayerResult, PlayerEffect>(scope) {

    private val featureScope = scope
    private val _effects = MutableSharedFlow<PlayerEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<PlayerEffect> get() = _effects

    override val initial = PlayerState()

    private var hasCompleted = false
    private var periodicSaveJob: Job? = null

    override val eventToAction: Interactor<PlayerEvent, PlayerAction> = { events ->
        merge(
            events.filterIsInstance<PlayerEvent.Play>()
                .map { PlayerAction.Play(it.episode) },

            events.filterIsInstance<PlayerEvent.PauseToggled>()
                .map { if (state.value.isPlaying) PlayerAction.Pause else PlayerAction.Resume },
        )
    }

    override val actionToResult: Interactor<PlayerAction, PlayerResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is PlayerAction.Play -> flow {
                    periodicSaveJob?.cancel()
                    periodicSaveJob = null

                    // Switch-away save for the episode we're leaving
                    val prev = state.value.nowPlaying
                    if (prev != null && !hasCompleted && !profileRepository.isGuest()) {
                        val pos = audioPlayer.currentPositionSeconds()
                        if (pos > MIN_POSITION_TO_SAVE_SECONDS) {
                            val dur = audioPlayer.durationSeconds()
                            progressRepository.saveProgress(prev, pos, false)
                        }
                    }

                    hasCompleted = false
                    audioPlayer.play(action.episode.audioUrl)
                    emit(PlayerResult.NowPlayingSet(action.episode))
                    emit(PlayerResult.PlaybackToggled(true))

                    periodicSaveJob = featureScope.launch { periodicSaveLoop() }
                }

                is PlayerAction.Pause -> flow {
                    periodicSaveJob?.cancel()
                    periodicSaveJob = null
                    audioPlayer.pause()
                    emit(PlayerResult.PlaybackToggled(false))
                }

                is PlayerAction.Resume -> flow {
                    audioPlayer.resume()
                    emit(PlayerResult.PlaybackToggled(true))
                    periodicSaveJob = featureScope.launch { periodicSaveLoop() }
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: PlayerState,
        result: PlayerResult,
    ): PlayerState = when (result) {
        is PlayerResult.NowPlayingSet -> previous.copy(nowPlaying = result.episode)
        is PlayerResult.PlaybackToggled -> previous.copy(isPlaying = result.isPlaying)
    }

    private suspend fun periodicSaveLoop() {
        while (true) {
            delay(SAVE_INTERVAL_MS)
            val ep = state.value.nowPlaying ?: break
            if (profileRepository.isGuest() || hasCompleted) continue
            val pos = audioPlayer.currentPositionSeconds()
            if (pos <= MIN_POSITION_TO_SAVE_SECONDS) continue
            val dur = audioPlayer.durationSeconds()
            if (dur != null && dur > 0 && (pos.toFloat() / dur.toFloat() * 100f) >= COMPLETION_THRESHOLD_PCT) {
                hasCompleted = true
                progressRepository.saveProgress(ep, pos, true)
                return
            }
            progressRepository.saveProgress(ep, pos, false)
        }
    }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.player.PlayerFeatureTest"
```

Expected: `BUILD SUCCESSFUL`, all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/player/PlayerFeatureTest.kt
git commit -m "feat: add progress saving to PlayerFeature with periodic save, switch-away, and completion mark"
```

---

## Task 5: Wire up `PlayerViewModel` and DI

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerViewModel.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`

- [ ] **Step 1: Update `PlayerViewModel.kt`**

```kotlin
package com.trilium.syncpods.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class PlayerViewModel(
    audioPlayer: AudioPlayer,
    progressRepository: ProgressRepository,
    profileRepository: ProfileRepository,
) : ViewModel() {
    val feature = PlayerFeature(
        scope = viewModelScope + Dispatchers.Default,
        audioPlayer = audioPlayer,
        progressRepository = progressRepository,
        profileRepository = profileRepository,
    )
}
```

- [ ] **Step 2: Register `ProgressRepository` and update `PlayerViewModel` in `AppModule.kt`**

Add the import block near the top of `AppModule.kt` with the other `player` imports:

```kotlin
import com.trilium.syncpods.player.ProgressRepository
import com.trilium.syncpods.player.SupabaseProgressRepository
```

Replace the existing `PlayerViewModel` registration line:

```kotlin
// Before:
viewModel { PlayerViewModel(get<AudioPlayer>()) }

// After:
single<ProgressRepository> { SupabaseProgressRepository(supabaseClient = get()) }
viewModel { PlayerViewModel(get(), get(), get()) }
```

- [ ] **Step 3: Build to verify**

```bash
./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Run all Android tests to confirm nothing regressed**

```bash
./gradlew :composeApp:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerViewModel.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt
git commit -m "feat: wire ProgressRepository and ProfileRepository into PlayerViewModel and DI"
```

---

## Verification

After all tasks are complete, manually verify end-to-end on an Android device or emulator (signed in):

1. Open the app and navigate to History — it should be empty.
2. Play any episode from Queue or Podcast Detail for more than 10 seconds.
3. Navigate to History — the episode should now appear under "Today".
4. Play to near completion (≥98%) — the episode should show the "✓ PLAYED" badge in History.
5. Sign out — History tab disappears. Sign back in — it reappears with the history intact.
