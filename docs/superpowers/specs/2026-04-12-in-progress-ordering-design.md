# In Progress Tab — Last-Accessed Ordering Fix

## Context

The History screen's **In Progress** tab is supposed to show in-progress episodes ordered by most recently accessed. The repository already queries `playback_progress` with `ORDER BY updated_at DESC`, so the sort is correct in principle.

**The bug:** `PlayerFeature.periodicSaveLoop` always waits 10 seconds before the first DB write. When a user taps play on an in-progress episode, `updated_at` isn't updated until 10 seconds in. During that window, another episode that was listened to more recently in a prior session stays ranked above the currently-playing one.

The fix is to save progress immediately when playback starts or resumes, so the episode's `updated_at` is bumped right away and History reflects the correct order instantly.

---

## Design

### 1. Add `positionSeconds` to `NowPlaying`

`NowPlaying` gains one optional field:

```kotlin
data class NowPlaying(
    ...
    val positionSeconds: Int? = null,   // starting position; null for brand-new episodes
)
```

This is natural data for the model to carry — the audio player needs to know where to seek on load, and the player needs it for an immediate progress save.

### 2. Pass `positionSeconds` from construction sites

Wherever a `NowPlaying` is constructed from a source that has a saved position, pass it through:

- **`HistoryScreen.kt`** (`HistoryEffect.PlayEpisode` handler): `positionSeconds = effect.item.positionSeconds`
- **`QueueScreen.kt`**: `QueueItem` has no `positionSeconds`, so no change needed — `positionSeconds` defaults to `null`

`PodcastDetailScreen` plays episodes from the RSS feed with no saved progress, so `positionSeconds` stays `null` there.

### 3. Immediate save on `PlayerAction.Play`

In `PlayerFeature.actionToResult`, after `audioPlayer.play()` and the `NowPlayingSet` emit, add an immediate save if we have a known starting position:

```kotlin
is PlayerAction.Play -> flow {
    // Switch-away save (existing)
    ...

    audioPlayer.play(action.episode.audioUrl)
    emit(PlayerResult.NowPlayingSet(action.episode))
    emit(PlayerResult.PlaybackToggled(true))

    // Immediate access save — bumps updated_at so History orders correctly
    val startPos = action.episode.positionSeconds
    if (!profileRepository.isGuest() && startPos != null && startPos > MIN_POSITION_TO_SAVE_SECONDS) {
        progressRepository.saveProgress(action.episode, startPos, false)
    }

    periodicSaveLoop(action.episode)
}
```

### 4. Immediate save on `PlayerAction.Resume`

Audio is paused at a known position, so `audioPlayer.currentPositionSeconds()` is reliable. Save before restarting the periodic loop:

```kotlin
is PlayerAction.Resume -> flow {
    audioPlayer.resume()
    emit(PlayerResult.PlaybackToggled(true))

    val ep = state.value.nowPlaying ?: return@flow

    // Immediate access save on resume
    if (!profileRepository.isGuest()) {
        val pos = audioPlayer.currentPositionSeconds()
        if (pos > MIN_POSITION_TO_SAVE_SECONDS) {
            progressRepository.saveProgress(ep, pos, false)
        }
    }

    periodicSaveLoop(ep)
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `player/NowPlaying.kt` | Add `positionSeconds: Int? = null` |
| `history/HistoryScreen.kt` | Pass `positionSeconds = effect.item.positionSeconds` |
| `queue/QueueScreen.kt` | No change — `QueueItem` has no saved position; `positionSeconds` stays `null` |
| `player/PlayerFeature.kt` | Add immediate save in `Play` and `Resume` action handlers |
| `player/PlayerFeatureTest.kt` | Add 7 new tests; update 1 existing test (`pause cancels periodic save and resume restarts it`) |

---

## Unit Tests

All tests live in `PlayerFeatureTest.kt`. Tests use `FakeAudioPlayer`, `FakeProgressRepository`, `FakeProfileRepository`, and `backgroundScope` per the existing pattern.

### New tests to add

**Immediate save on Play:**

| Test | Setup | Expected |
|------|-------|----------|
| `immediate save fires on play when positionSeconds is above threshold` | `testEpisode("ep1", positionSeconds = 60)`, no time advance | 1 save immediately (ep1, pos=60, completed=false) |
| `immediate save does not fire on play when positionSeconds is null` | `testEpisode("ep1")` (positionSeconds null), no time advance | 0 saves |
| `immediate save does not fire on play when positionSeconds is at or below threshold` | `testEpisode("ep1", positionSeconds = 5)`, no time advance | 0 saves |
| `immediate play save does not fire for guest` | `testEpisode("ep1", positionSeconds = 60)`, `isGuest = true` | 0 saves |

**Immediate save on Resume:**

| Test | Setup | Expected |
|------|-------|----------|
| `immediate save fires on resume` | `FakeAudioPlayer(positionSeconds = 60)`, play ep1, pause, resume — no time advance after resume | 1 save immediately on resume |
| `immediate save does not fire on resume when position is at or below threshold` | `FakeAudioPlayer(positionSeconds = 5)`, play, pause, resume | 0 saves after resume (position guard) |
| `immediate resume save does not fire for guest` | `FakeAudioPlayer(positionSeconds = 60)`, `isGuest = true`, play, pause, resume | 0 saves |

### Existing test that needs updating

`pause cancels periodic save and resume restarts it` — after the fix, resume fires an immediate save AND then the periodic loop. After `advanceTimeBy(10_001)` post-resume, the save count should be **2** (1 immediate + 1 periodic), not 1. Update `assertEquals(1, ...)` → `assertEquals(2, ...)`.

### `testEpisode` helper update

Add an optional `positionSeconds` parameter:

```kotlin
private fun testEpisode(guid: String, positionSeconds: Int? = null) = NowPlaying(
    guid = guid,
    ...
    positionSeconds = positionSeconds,
)
```

---

## Verification

1. Open the app with at least two in-progress episodes (e.g., The Third Man and The Daily).
2. Ensure The Daily has a more recent `updated_at` than The Third Man (so Daily appears first).
3. Tap play on The Third Man.
4. **Before fix:** The Third Man stays at position 2 for up to 10 seconds.  
   **After fix:** The Third Man moves to position 1 immediately (within the next `ProgressSaved` silent-reload cycle, which fires as soon as the immediate save completes).
5. Verify that pausing and resuming The Third Man also keeps it at position 1.
6. Run `./gradlew :composeApp:allTests` — no regressions.
