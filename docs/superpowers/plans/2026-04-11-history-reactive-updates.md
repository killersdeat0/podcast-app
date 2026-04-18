# History Reactive Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the History tab update reactively when the player saves progress, and remove the per-resume reload flash.

**Architecture:** `ProgressRepository` exposes a `SharedFlow<Unit>` that emits after each save. `HistoryFeature` accepts a `progressUpdates: Flow<Unit>` constructor param, subscribes internally, and fires a new `SilentLoad` action (no loading spinner) on each emission. `AppShell` switches from `repeatOnLifecycle(RESUMED)` to a one-shot `LaunchedEffect(Unit)` so history loads once on cold start and then stays fresh via the reactive flow.

**Tech Stack:** Kotlin Multiplatform, Compose Multiplatform, composure `arch` library (`StandardFeature`), kotlinx-coroutines, Turbine (tests), Koin (DI)

---

## File Map

| File | Change |
|------|--------|
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/ProgressRepository.kt` | Add `progressSaved: SharedFlow<Unit>` to interface; add `_progressSaved` + emit in `SupabaseProgressRepository` |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryFeature.kt` | Add `HistoryEvent.ProgressSaved`, `HistoryAction.SilentLoad`, `progressUpdates: Flow<Unit>` param, `init` observer, pipeline wiring |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryViewModel.kt` | Add `progressRepository: ProgressRepository` param; pass `progressRepository.progressSaved` to feature |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt` | Add third `get()` to `HistoryViewModel` binding |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt` | Replace `repeatOnLifecycle(RESUMED)` block with `LaunchedEffect(Unit)` in the History composable |
| `composeApp/src/commonTest/kotlin/com/trilium/syncpods/history/HistoryFeatureTest.kt` | Make `FakeHistoryRepository.items` a `var`; add silent-reload test |

---

## Task 1: Add `progressSaved` flow to `ProgressRepository`

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/ProgressRepository.kt`

- [ ] **Step 1: Add `progressSaved` to the interface and implement it**

  In `ProgressRepository.kt`, add two imports at the top of the file (after the existing imports):

  ```kotlin
  import kotlinx.coroutines.flow.MutableSharedFlow
  import kotlinx.coroutines.flow.SharedFlow
  ```

  Update the interface to add the property:

  ```kotlin
  interface ProgressRepository {
      val progressSaved: SharedFlow<Unit>
      suspend fun saveProgress(
          nowPlaying: NowPlaying,
          positionSeconds: Int,
          completed: Boolean,
      )
  }
  ```

  In `SupabaseProgressRepository`, add the backing field and override immediately after the class declaration and `lastSaveInstant` property:

  ```kotlin
  class SupabaseProgressRepository(
      private val supabaseClient: SupabaseClient,
  ) : ProgressRepository {

      private var lastSaveInstant: Instant? = null

      private val _progressSaved = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
      override val progressSaved: SharedFlow<Unit> get() = _progressSaved
  ```

  At the very end of `saveProgress`, just before the closing `}` of the function (after the entire `if (deltaSeconds > 0) { ... } else if (completed) { ... }` block), emit:

  ```kotlin
      _progressSaved.emit(Unit)
  }
  ```

- [ ] **Step 2: Build to confirm no compilation errors**

  ```bash
  cd /Users/personal/VisualStudioProjects/podcast-app/mobile && ./gradlew :composeApp:assembleDebug
  ```

  Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

  ```bash
  git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/player/ProgressRepository.kt
  git commit -m "feat: add progressSaved SharedFlow to ProgressRepository"
  ```

---

## Task 2: Add `SilentLoad` to `HistoryFeature` and write the test

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryFeature.kt`
- Modify: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/history/HistoryFeatureTest.kt`

- [ ] **Step 1: Write the failing test**

  In `HistoryFeatureTest.kt`, add this import near the top (with the other kotlinx imports):

  ```kotlin
  import kotlinx.coroutines.flow.MutableSharedFlow
  ```

  Change `FakeHistoryRepository` so `items` is a `var` instead of `val` (needed so the test can swap return values mid-run):

  ```kotlin
  private class FakeHistoryRepository(
      var items: List<HistoryItem> = emptyList(),
      var shouldThrow: Boolean = false,
      var isFreeTierCaptured: Boolean? = null,
      var getHistoryCallCount: Int = 0,
  ) : HistoryRepository {
  ```

  Add this test at the bottom of the `HistoryFeatureTest` class, before the closing `}`:

  ```kotlin
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
  ```

- [ ] **Step 2: Run the test to confirm it fails to compile**

  ```bash
  cd /Users/personal/VisualStudioProjects/podcast-app/mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.history.HistoryFeatureTest.silently refreshes history on ProgressSaved without showing loading state" 2>&1 | tail -20
  ```

  Expected: compilation error — `HistoryFeature` constructor does not accept a `progressUpdates` parameter yet.

- [ ] **Step 3: Implement the `HistoryFeature` changes**

  In `HistoryFeature.kt`, add these imports (with the existing `kotlinx.coroutines.flow.*` imports):

  ```kotlin
  import kotlinx.coroutines.flow.Flow
  import kotlinx.coroutines.flow.emptyFlow
  import kotlinx.coroutines.launch
  ```

  Add `HistoryEvent.ProgressSaved` to the events sealed class:

  ```kotlin
  sealed class HistoryEvent {
      data object ScreenVisible : HistoryEvent()
      data object RetryTapped : HistoryEvent()
      data object ProgressSaved : HistoryEvent()
      data class TabSelected(val tab: HistoryTab) : HistoryEvent()
      data class EpisodeTapped(val item: HistoryItem) : HistoryEvent()
  }
  ```

  Add `HistoryAction.SilentLoad` to the actions sealed class:

  ```kotlin
  sealed class HistoryAction {
      data object Load : HistoryAction()
      data object SilentLoad : HistoryAction()
      data class SwitchTab(val tab: HistoryTab) : HistoryAction()
      data class PlayEpisode(val item: HistoryItem) : HistoryAction()
  }
  ```

  Update the `HistoryFeature` class declaration to add the `progressUpdates` parameter (with a default so existing callers don't break) and add the `init` block:

  ```kotlin
  @OptIn(ExperimentalCoroutinesApi::class)
  class HistoryFeature(
      scope: CoroutineScope,
      private val repository: HistoryRepository,
      private val profileRepository: ProfileRepository,
      progressUpdates: Flow<Unit> = emptyFlow(),
  ) : StandardFeature<HistoryState, HistoryEvent, HistoryAction, HistoryResult, HistoryEffect>(scope) {

      init {
          scope.launch {
              progressUpdates.collect { process(HistoryEvent.ProgressSaved) }
          }
      }
  ```

  Add `HistoryEvent.ProgressSaved → HistoryAction.SilentLoad` in `eventToAction`:

  ```kotlin
  override val eventToAction: Interactor<HistoryEvent, HistoryAction> = { events ->
      merge(
          events.filterIsInstance<HistoryEvent.ScreenVisible>().map { HistoryAction.Load },
          events.filterIsInstance<HistoryEvent.RetryTapped>().map { HistoryAction.Load },
          events.filterIsInstance<HistoryEvent.ProgressSaved>().map { HistoryAction.SilentLoad },
          events.filterIsInstance<HistoryEvent.TabSelected>().map { HistoryAction.SwitchTab(it.tab) },
          events.filterIsInstance<HistoryEvent.EpisodeTapped>().map { HistoryAction.PlayEpisode(it.item) },
      )
  }
  ```

  Add the `SilentLoad` case in `actionToResult` (fetches and emits `Loaded` with no `Loading` first):

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
              is HistoryAction.SilentLoad -> flow {
                  try {
                      val tier = profileRepository.getUserTier()
                      val items = repository.getHistory(isFreeTier = tier == "free")
                      emit(HistoryResult.Loaded(items))
                  } catch (e: Exception) {
                      emit(HistoryResult.LoadError(e.message ?: "Failed to load history"))
                  }
              }
              is HistoryAction.SwitchTab -> flowOf<HistoryResult>(HistoryResult.TabSwitched(action.tab))
              is HistoryAction.PlayEpisode -> flow<HistoryResult> {
                  _effects.emit(HistoryEffect.PlayEpisode(action.item))
              }
          }
      }
  }
  ```

- [ ] **Step 4: Run the new test to confirm it passes**

  ```bash
  cd /Users/personal/VisualStudioProjects/podcast-app/mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.history.HistoryFeatureTest.silently refreshes history on ProgressSaved without showing loading state" 2>&1 | tail -20
  ```

  Expected: `BUILD SUCCESSFUL` with 1 test passing.

- [ ] **Step 5: Run the full HistoryFeatureTest suite**

  ```bash
  cd /Users/personal/VisualStudioProjects/podcast-app/mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.history.HistoryFeatureTest" 2>&1 | tail -20
  ```

  Expected: `BUILD SUCCESSFUL`, all tests passing. (Existing tests are unaffected because `progressUpdates` defaults to `emptyFlow()`.)

- [ ] **Step 6: Commit**

  ```bash
  git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryFeature.kt \
          composeApp/src/commonTest/kotlin/com/trilium/syncpods/history/HistoryFeatureTest.kt
  git commit -m "feat: add SilentLoad action to HistoryFeature for reactive progress updates"
  ```

---

## Task 3: Wire `HistoryViewModel` and `AppModule`

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryViewModel.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`

- [ ] **Step 1: Update `HistoryViewModel`**

  Replace the entire file content with:

  ```kotlin
  package com.trilium.syncpods.history

  import androidx.lifecycle.ViewModel
  import androidx.lifecycle.viewModelScope
  import com.trilium.syncpods.player.ProgressRepository
  import com.trilium.syncpods.profile.ProfileRepository
  import kotlinx.coroutines.Dispatchers
  import kotlinx.coroutines.plus

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

- [ ] **Step 2: Update `AppModule` DI binding**

  In `AppModule.kt`, change the `HistoryViewModel` binding from:

  ```kotlin
  viewModel { HistoryViewModel(get(), get()) }
  ```

  to:

  ```kotlin
  viewModel { HistoryViewModel(get(), get(), get()) }
  ```

- [ ] **Step 3: Build to confirm no errors**

  ```bash
  cd /Users/personal/VisualStudioProjects/podcast-app/mobile && ./gradlew :composeApp:assembleDebug 2>&1 | tail -20
  ```

  Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

  ```bash
  git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryViewModel.kt \
          composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt
  git commit -m "feat: wire ProgressRepository into HistoryViewModel for reactive history updates"
  ```

---

## Task 4: Remove resume-triggered reload flash from AppShell

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt`

- [ ] **Step 1: Replace the History composable lifecycle block**

  Find and replace the History composable destination (around line 234). Change from:

  ```kotlin
  composable(AppRoutes.History.route) {
      val viewModel = koinViewModel<HistoryViewModel>()
      val lifecycleOwner = LocalLifecycleOwner.current
      LaunchedEffect(lifecycleOwner) {
          lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
              viewModel.feature.process(HistoryEvent.ScreenVisible)
          }
      }
      HistoryScreen(
          feature = viewModel.feature,
          onPlayEpisode = onPlayEpisode,
          modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
          bottomContentPadding = innerPadding.calculateBottomPadding(),
      )
  }
  ```

  to:

  ```kotlin
  composable(AppRoutes.History.route) {
      val viewModel = koinViewModel<HistoryViewModel>()
      LaunchedEffect(Unit) {
          viewModel.feature.process(HistoryEvent.ScreenVisible)
      }
      HistoryScreen(
          feature = viewModel.feature,
          onPlayEpisode = onPlayEpisode,
          modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
          bottomContentPadding = innerPadding.calculateBottomPadding(),
      )
  }
  ```

  Note: Do **not** remove the `LocalLifecycleOwner`, `Lifecycle`, or `repeatOnLifecycle` imports — they are used by another screen further down in the same file.

- [ ] **Step 2: Build and run all tests**

  ```bash
  cd /Users/personal/VisualStudioProjects/podcast-app/mobile && ./gradlew :composeApp:assembleDebug && ./gradlew :composeApp:testDebugUnitTest 2>&1 | tail -30
  ```

  Expected: `BUILD SUCCESSFUL`, all tests passing.

- [ ] **Step 3: Commit**

  ```bash
  git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt
  git commit -m "fix: remove resume-triggered history reload to eliminate loading flash"
  ```
