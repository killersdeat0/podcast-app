# History Reactive Updates Design

**Date:** 2026-04-11

## Problem

The History tab reloads on every `Lifecycle.RESUMED` event (tab switch, foreground resume) via `repeatOnLifecycle(RESUMED)`. This causes a loading spinner flash every time the user returns to the tab. Additionally, history content does not update while the user is viewing it — progress saves from the player write to Supabase silently, with no signal to the History feature.

## Goal

- History content updates reactively when the player saves progress (no manual tab switch needed)
- Eliminate the resume-triggered reload flash; do a single cold-start load instead
- Silent refresh: no loading spinner on progress-triggered reloads, only on initial load and explicit retry

---

## Design

### 1. ProgressRepository — add `progressSaved` flow

Add a `SharedFlow<Unit>` to the interface. `SupabaseProgressRepository` emits on it after each successful `saveProgress` call.

```kotlin
// ProgressRepository.kt
interface ProgressRepository {
    val progressSaved: SharedFlow<Unit>
    suspend fun saveProgress(nowPlaying: NowPlaying, positionSeconds: Int, completed: Boolean)
}

// SupabaseProgressRepository.kt
class SupabaseProgressRepository(...) : ProgressRepository {
    private val _progressSaved = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    override val progressSaved: SharedFlow<Unit> get() = _progressSaved

    override suspend fun saveProgress(...) {
        // ... existing upsert logic ...
        _progressSaved.emit(Unit)
    }
}
```

`extraBufferCapacity = 8` matches the existing effects pattern in the codebase and prevents dropped emissions if the collector is briefly slow.

### 2. HistoryFeature — new event, action, and internal observer

**New types:**
- `HistoryEvent.ProgressSaved` — internal trigger (emitted by the feature's own coroutine, not from UI)
- `HistoryAction.SilentLoad` — fetch history without emitting `Loading` result

**Constructor change:**
```kotlin
class HistoryFeature(
    scope: CoroutineScope,
    repository: HistoryRepository,
    profileRepository: ProfileRepository,
    progressUpdates: Flow<Unit> = emptyFlow(),
) : StandardFeature<HistoryState, HistoryEvent, HistoryAction, HistoryResult, HistoryEffect>(scope) {

    init {
        scope.launch {
            progressUpdates.collect { process(HistoryEvent.ProgressSaved) }
        }
    }
    // ...
}
```

**Pipeline additions:**
```
eventToAction:
  ProgressSaved → SilentLoad

actionToResult:
  SilentLoad →
    val tier = profileRepository.getUserTier()
    val items = repository.getHistory(isFreeTier = tier == "free")
    emit(Loaded(items))        // no Loading emitted — no spinner
```

`SilentLoad` shares the same `Loaded`/`LoadError` results as `Load`, so `handleResult` needs no changes.

### 3. HistoryViewModel — pass progress flow

```kotlin
class HistoryViewModel(
    repository: HistoryRepository,
    profileRepository: ProfileRepository,
    progressRepository: ProgressRepository,
) : ViewModel() {
    val feature = HistoryFeature(
        viewModelScope + Dispatchers.Default,
        repository,
        profileRepository,
        progressUpdates = progressRepository.progressSaved,
    )
}
```

### 4. AppModule — inject ProgressRepository into HistoryViewModel

```kotlin
viewModel { HistoryViewModel(get(), get(), get()) }
```

### 5. AppShell — single cold-start load

Replace `repeatOnLifecycle(RESUMED)` with a one-shot `LaunchedEffect`:

```kotlin
// Before:
LaunchedEffect(lifecycleOwner) {
    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
        viewModel.feature.process(HistoryEvent.ScreenVisible)
    }
}

// After:
LaunchedEffect(Unit) {
    viewModel.feature.process(HistoryEvent.ScreenVisible)
}
```

`HistoryViewModel` is scoped to the NavBackStackEntry and survives tab switches, so the state (and any in-flight reactive updates) persists. The cold-start `ScreenVisible` fires once when the destination first enters composition.

---

## Files Changed

| File | Change |
|------|--------|
| `composeApp/src/commonMain/.../player/ProgressRepository.kt` | Add `progressSaved: SharedFlow<Unit>` to interface and `_progressSaved` flow + emit in `SupabaseProgressRepository` (same file) |
| `composeApp/src/commonMain/.../history/HistoryFeature.kt` | Add `ProgressSaved` event, `SilentLoad` action, `progressUpdates` param, `init` observer |
| `composeApp/src/commonMain/.../history/HistoryViewModel.kt` | Add `progressRepository` param, pass flow to feature |
| `composeApp/src/commonMain/.../di/AppModule.kt` | Add `get()` for `ProgressRepository` in `HistoryViewModel` binding |
| `composeApp/src/commonMain/.../shell/AppShell.kt` | Replace `repeatOnLifecycle(RESUMED)` with `LaunchedEffect(Unit)` |
| `composeApp/src/commonTest/.../history/HistoryFeatureTest.kt` | Update constructor calls; add silent-reload test |

---

## Tests

**Existing tests:** Update `HistoryFeature(backgroundScope, repo, FakeProfileRepository())` → add `progressUpdates = emptyFlow()`. No behavior change expected.

**FakeHistoryRepository change:** Change `private val items` to `var items` so tests can swap the return value mid-test.

**New test:**
```
`silently refreshes history on ProgressSaved without showing loading state`
- Create MutableSharedFlow<Unit> as progressUpdates
- Create FakeHistoryRepository with initial items list A
- Construct HistoryFeature with progressUpdates
- Process ScreenVisible, await Loaded with list A
- Set repo.items = list B, emit Unit on progressUpdates
- Assert next state has list B items
- Assert isLoading never became true during the refresh (collect all intermediate states)
```

---

## Verification

1. Run unit tests: `./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.history.HistoryFeatureTest"`
2. Build: `./gradlew :composeApp:assembleDebug`
3. Manual: navigate to History tab, play an episode for 10+ seconds, observe history updates without tab switch
4. Manual: switch away from History tab and back — confirm no loading flash
