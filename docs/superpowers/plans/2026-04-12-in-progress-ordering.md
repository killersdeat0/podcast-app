# In Progress Ordering Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the In Progress tab so the currently-playing episode immediately appears at the top when playback starts or resumes, instead of waiting up to 10 seconds for the first periodic save.

**Architecture:** Add `positionSeconds: Int? = null` to `NowPlaying` so the player knows the starting position. Use it to fire an immediate `saveProgress` call in the `Play` action handler. Do the same on `Resume` using `audioPlayer.currentPositionSeconds()`. The immediate save emits `progressSaved`, which triggers History's existing `SilentLoad`, which re-fetches from the DB (already sorted `updated_at DESC`) — so no History changes are needed.

**Tech Stack:** Kotlin Multiplatform, Compose Multiplatform, `StandardFeature` / `arch` library (io.github.reid-mcpherson:arch), Turbine for flow testing, kotlinx-coroutines-test virtual time.

---

## Files

| File | Change |
|------|--------|
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/NowPlaying.kt` | Add `positionSeconds: Int? = null` |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt` | Pass `positionSeconds = effect.item.positionSeconds` |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerFeature.kt` | Immediate save in `Play` and `Resume` handlers |
| `composeApp/src/commonTest/kotlin/com/trilium/syncpods/player/PlayerFeatureTest.kt` | 7 new tests; update 1 existing |

---

## Task 1: Add `positionSeconds` to `NowPlaying` and thread it through `HistoryScreen`

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/NowPlaying.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt`

- [ ] **Step 1: Add the field to `NowPlaying`**

Open `NowPlaying.kt`. The current file is:

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

Replace with:

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
    val positionSeconds: Int? = null,
)
```

- [ ] **Step 2: Pass `positionSeconds` in `HistoryScreen`**

Open `HistoryScreen.kt`. Find the `HistoryEffect.PlayEpisode` handler (around line 51). The current `NowPlaying(...)` constructor call is:

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

Replace with:

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
        positionSeconds = effect.item.positionSeconds,
    )
)
```

- [ ] **Step 3: Verify the build compiles**

Run from the `mobile/` directory:

```bash
./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. The `positionSeconds` field defaults to `null`, so all other `NowPlaying(...)` construction sites (Queue, PodcastDetail) are unaffected.

- [ ] **Step 4: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/NowPlaying.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt
git commit -m "feat: add positionSeconds to NowPlaying and thread through HistoryScreen"
```

---

## Task 2: Write failing tests for immediate save on `Play`

**Files:**
- Modify: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/player/PlayerFeatureTest.kt`

- [ ] **Step 1: Update the `testEpisode` helper to accept `positionSeconds`**

Find the `testEpisode` helper at the bottom of `PlayerFeatureTest.kt`:

```kotlin
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

Replace with:

```kotlin
private fun testEpisode(guid: String, positionSeconds: Int? = null) = NowPlaying(
    guid = guid,
    title = "Episode $guid",
    podcastName = "Test Podcast",
    artworkUrl = "https://art.example.com/cover.jpg",
    audioUrl = "https://audio.example.com/$guid.mp3",
    feedUrl = "https://feed.example.com/rss",
    durationSeconds = 3600,
    positionSeconds = positionSeconds,
)
```

- [ ] **Step 2: Add 4 new tests for Play immediate save**

Add these four tests to the `PlayerFeatureTest` class body (before the closing `}`):

```kotlin
@Test
fun `immediate save fires on play when positionSeconds is above threshold`() = runTest {
    val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
    val progress = FakeProgressRepository()
    val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

    feature.state.test {
        awaitItem() // initial
        feature.process(PlayerEvent.Play(testEpisode("ep1", positionSeconds = 60)))
        var s = awaitItem()
        while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

        assertEquals(1, progress.saveCalls.size)
        assertEquals("ep1", progress.saveCalls[0].first.guid)
        assertEquals(60, progress.saveCalls[0].second)
        assertFalse(progress.saveCalls[0].third)

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `immediate save does not fire on play when positionSeconds is null`() = runTest {
    val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
    val progress = FakeProgressRepository()
    val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

    feature.state.test {
        awaitItem()
        feature.process(PlayerEvent.Play(testEpisode("ep1"))) // positionSeconds = null
        var s = awaitItem()
        while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

        assertEquals(0, progress.saveCalls.size)

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `immediate save does not fire on play when positionSeconds is at or below threshold`() = runTest {
    val audio = FakeAudioPlayer(positionSeconds = 5, durationSeconds = 3600)
    val progress = FakeProgressRepository()
    val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

    feature.state.test {
        awaitItem()
        feature.process(PlayerEvent.Play(testEpisode("ep1", positionSeconds = 5)))
        var s = awaitItem()
        while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

        assertEquals(0, progress.saveCalls.size)

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `immediate play save does not fire for guest`() = runTest {
    val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
    val progress = FakeProgressRepository()
    val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository(isGuest = true))

    feature.state.test {
        awaitItem()
        feature.process(PlayerEvent.Play(testEpisode("ep1", positionSeconds = 60)))
        var s = awaitItem()
        while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

        assertEquals(0, progress.saveCalls.size)

        cancelAndIgnoreRemainingEvents()
    }
}
```

- [ ] **Step 3: Run the new tests and verify they fail**

```bash
./gradlew :composeApp:testDebugUnitTest \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save fires on play when positionSeconds is above threshold" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save does not fire on play when positionSeconds is null" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save does not fire on play when positionSeconds is at or below threshold" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate play save does not fire for guest"
```

Expected: the first test (`immediate save fires on play when positionSeconds is above threshold`) FAILs with `expected:<1> but was:<0>`. The other three pass (they assert 0 saves, which is currently true). This confirms the test correctly catches the missing behaviour.

---

## Task 3: Implement immediate save on `Play`

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerFeature.kt`

- [ ] **Step 1: Add the immediate save to the `Play` handler**

Open `PlayerFeature.kt`. Find the `PlayerAction.Play` branch in `actionToResult` (around line 85). The current flow block ends with:

```kotlin
                    audioPlayer.play(action.episode.audioUrl)
                    emit(PlayerResult.NowPlayingSet(action.episode))
                    emit(PlayerResult.PlaybackToggled(true))

                    // Periodic save loop — cancelled automatically by flatMapLatest on next action
                    periodicSaveLoop(action.episode)
```

Replace those four lines with:

```kotlin
                    audioPlayer.play(action.episode.audioUrl)
                    emit(PlayerResult.NowPlayingSet(action.episode))
                    emit(PlayerResult.PlaybackToggled(true))

                    // Immediate access save — bumps updated_at so History orders correctly
                    val startPos = action.episode.positionSeconds
                    if (!profileRepository.isGuest() && startPos != null && startPos > MIN_POSITION_TO_SAVE_SECONDS) {
                        progressRepository.saveProgress(action.episode, startPos, false)
                    }

                    // Periodic save loop — cancelled automatically by flatMapLatest on next action
                    periodicSaveLoop(action.episode)
```

- [ ] **Step 2: Run the Play immediate-save tests and verify they all pass**

```bash
./gradlew :composeApp:testDebugUnitTest \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save fires on play when positionSeconds is above threshold" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save does not fire on play when positionSeconds is null" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save does not fire on play when positionSeconds is at or below threshold" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate play save does not fire for guest"
```

Expected: all 4 PASS.

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
./gradlew :composeApp:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, all existing tests still pass (they all use `testEpisode` with `positionSeconds = null`, so no immediate save fires and their assertions are unchanged).

- [ ] **Step 4: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/player/PlayerFeatureTest.kt
git commit -m "feat: save progress immediately on play start to fix In Progress ordering"
```

---

## Task 4: Write failing tests for immediate save on `Resume`

**Files:**
- Modify: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/player/PlayerFeatureTest.kt`

- [ ] **Step 1: Add 3 new tests for Resume immediate save**

Add these three tests to the `PlayerFeatureTest` class body:

```kotlin
@Test
fun `immediate save fires on resume`() = runTest {
    val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
    val progress = FakeProgressRepository()
    val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

    feature.state.test {
        awaitItem()
        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        var s = awaitItem()
        while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

        feature.process(PlayerEvent.PauseToggled) // pause
        s = awaitItem()
        while (s.isPlaying) s = awaitItem()

        val savesBeforeResume = progress.saveCalls.size

        feature.process(PlayerEvent.PauseToggled) // resume
        s = awaitItem()
        while (!s.isPlaying) s = awaitItem()

        // Immediate save fires on resume without time advance
        assertEquals(savesBeforeResume + 1, progress.saveCalls.size)
        assertEquals("ep1", progress.saveCalls.last().first.guid)
        assertEquals(60, progress.saveCalls.last().second)
        assertFalse(progress.saveCalls.last().third)

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `immediate save does not fire on resume when position is at or below threshold`() = runTest {
    val audio = FakeAudioPlayer(positionSeconds = 5, durationSeconds = 3600)
    val progress = FakeProgressRepository()
    val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository())

    feature.state.test {
        awaitItem()
        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        var s = awaitItem()
        while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

        feature.process(PlayerEvent.PauseToggled) // pause
        s = awaitItem()
        while (s.isPlaying) s = awaitItem()

        val savesBeforeResume = progress.saveCalls.size

        feature.process(PlayerEvent.PauseToggled) // resume
        s = awaitItem()
        while (!s.isPlaying) s = awaitItem()

        assertEquals(savesBeforeResume, progress.saveCalls.size)

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `immediate resume save does not fire for guest`() = runTest {
    val audio = FakeAudioPlayer(positionSeconds = 60, durationSeconds = 3600)
    val progress = FakeProgressRepository()
    val feature = PlayerFeature(backgroundScope, audio, progress, FakeProfileRepository(isGuest = true))

    feature.state.test {
        awaitItem()
        feature.process(PlayerEvent.Play(testEpisode("ep1")))
        var s = awaitItem()
        while (!s.isPlaying || s.nowPlaying == null) s = awaitItem()

        feature.process(PlayerEvent.PauseToggled) // pause
        s = awaitItem()
        while (s.isPlaying) s = awaitItem()

        feature.process(PlayerEvent.PauseToggled) // resume
        s = awaitItem()
        while (!s.isPlaying) s = awaitItem()

        assertEquals(0, progress.saveCalls.size)

        cancelAndIgnoreRemainingEvents()
    }
}
```

- [ ] **Step 2: Update the existing `pause cancels periodic save and resume restarts it` test**

Find the test `pause cancels periodic save and resume restarts it`. Near the end, find:

```kotlin
            // Advance 10s — timer should fire
            advanceTimeBy(10_001)
            assertEquals(1, progress.saveCalls.size)
```

Replace with:

```kotlin
            // Advance 10s — immediate save on resume + one periodic save
            advanceTimeBy(10_001)
            assertEquals(2, progress.saveCalls.size)
```

- [ ] **Step 3: Run the Resume tests and verify the right ones fail**

```bash
./gradlew :composeApp:testDebugUnitTest \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save fires on resume" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save does not fire on resume when position is at or below threshold" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate resume save does not fire for guest" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.pause cancels periodic save and resume restarts it"
```

Expected:
- `immediate save fires on resume` → FAIL (`expected:<1> but was:<0>`)
- `pause cancels periodic save and resume restarts it` → FAIL (`expected:<2> but was:<1>`)
- The other two new tests PASS (they assert no additional saves, which is currently true)

---

## Task 5: Implement immediate save on `Resume`

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerFeature.kt`

- [ ] **Step 1: Add the immediate save to the `Resume` handler**

Open `PlayerFeature.kt`. Find the `PlayerAction.Resume` branch in `actionToResult` (around line 111). The current block is:

```kotlin
                is PlayerAction.Resume -> flow {
                    audioPlayer.resume()
                    emit(PlayerResult.PlaybackToggled(true))
                    val ep = state.value.nowPlaying ?: return@flow
                    // Restart periodic save loop after resume
                    periodicSaveLoop(ep)
                }
```

Replace with:

```kotlin
                is PlayerAction.Resume -> flow {
                    audioPlayer.resume()
                    emit(PlayerResult.PlaybackToggled(true))
                    val ep = state.value.nowPlaying ?: return@flow
                    // Immediate access save on resume — bumps updated_at so History orders correctly
                    if (!profileRepository.isGuest()) {
                        val pos = audioPlayer.currentPositionSeconds()
                        if (pos > MIN_POSITION_TO_SAVE_SECONDS) {
                            progressRepository.saveProgress(ep, pos, false)
                        }
                    }
                    // Restart periodic save loop after resume
                    periodicSaveLoop(ep)
                }
```

- [ ] **Step 2: Run the Resume tests and verify they all pass**

```bash
./gradlew :composeApp:testDebugUnitTest \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save fires on resume" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate save does not fire on resume when position is at or below threshold" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.immediate resume save does not fire for guest" \
  --tests "com.trilium.syncpods.player.PlayerFeatureTest.pause cancels periodic save and resume restarts it"
```

Expected: all 4 PASS.

- [ ] **Step 3: Run the full test suite**

```bash
./gradlew :composeApp:allTests
```

Expected: `BUILD SUCCESSFUL`, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/PlayerFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/player/PlayerFeatureTest.kt
git commit -m "feat: save progress immediately on resume to fix In Progress ordering"
```
