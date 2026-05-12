# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SyncPods is a **Kotlin Multiplatform (KMP)** app with **Compose Multiplatform** UI, sharing code between Android and iOS. Package: `com.trilium.syncpods`.

## Build Commands

```bash
# Build Android debug APK
./gradlew :composeApp:assembleDebug

# Run Android tests
./gradlew :composeApp:testDebugUnitTest

# Run common tests
./gradlew :composeApp:allTests

# Run a single test class
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.ComposeAppCommonTest"

# iOS: open in Xcode and build from there, or use xcodebuild
```

## Architecture

### Module Structure
- **`composeApp/`** — Single KMP module with source sets:
  - `commonMain` — Shared Kotlin/Compose UI and logic (the primary place for new code)
  - `androidMain` — Android-specific implementations
  - `iosMain` — iOS-specific implementations
  - `commonTest` — Shared tests
- **`iosApp/`** — Native Swift/SwiftUI host that embeds the shared Compose UI via `ComposeView: UIViewControllerRepresentable`

### Expect/Actual Pattern
Platform-specific behavior is abstracted via `expect`/`actual`:
- `commonMain/Platform.kt` — defines the `Platform` interface and `expect fun getPlatform()`
- `androidMain/Platform.android.kt` and `iosMain/Platform.ios.kt` — provide `actual` implementations

When adding new platform-specific functionality, follow this same pattern.

### UI
All UI is in `commonMain` using Compose Multiplatform. `App.kt` is the root composable, wrapped by Material3 theme. Android entry point is `MainActivity`; iOS entry point calls `MainViewController()` from `iosMain`.

### Dependency Versions
Managed via Gradle version catalog at `gradle/libs.versions.toml`. Key versions: Kotlin 2.3.0, Compose Multiplatform 1.10.0, minSdk 26, targetSdk/compileSdk 36.

## Architecture Standards

### UDF Pipeline (composure `arch` library)

All features follow a strict Unidirectional Data Flow pipeline:

```
Event → [eventToAction] → Action → [actionToResult] → Result → [handleResult] → State
                                                                      ↓
                                                                   Effect (optional one-time)
```

| Type | Role | Convention |
|------|------|------------|
| `STATE` | Immutable UI snapshot | `data class`, single sealed hierarchy per feature |
| `EVENT` | User/system inputs | `sealed class`, past-tense or imperative nouns |
| `ACTION` | Business intents derived from events | `sealed class` |
| `RESULT` | Outcomes of processing an action | `sealed class` |
| `EFFECT` | One-time side effects (nav, toasts) | `sealed class` |

### Core Library

The `arch` library (`io.github.reid-mcpherson:arch:1.0.2`) is declared in `commonMain.dependencies` and provides (package `com.composure.arch`):

- `Feature<STATE, EVENT, EFFECT>` — public-facing interface (`state: StateFlow`, `effects: Flow`, `process(event)`)
- `Interactor<T, R>` — type alias: `(Flow<T>) -> Flow<R>`
- `StandardFeature<STATE, EVENT, ACTION, RESULT, EFFECT>(scope: CoroutineScope)` — abstract base class; subclasses implement `initial`, `eventToAction`, `actionToResult`, `handleResult`

### Package Structure (feature-first)

```
commonMain/kotlin/com/trilium/syncpods/
├── <feature>/
│   ├── <Feature>Feature.kt        ← STATE, EVENT, ACTION, RESULT, EFFECT + StandardFeature subclass
│   ├── <Feature>Screen.kt         ← @Composable UI, collects state, sends events
│   ├── <Feature>ViewModel.kt      ← thin ViewModel wrapper (lifecycle owner)
│   ├── <Feature>Models.kt         ← domain model data classes
│   └── <Feature>Repository.kt     ← data layer interface + impl
├── components/                    ← reusable composables (PodcastCard, PodcastSearchBar, etc.)
├── navigation/AppRoutes.kt        ← sealed class route definitions
├── shell/AppShell.kt              ← Scaffold + NavigationBar + NavHost; retrieves ViewModels via koinViewModel<>()
├── theme/Theme.kt                 ← SyncPodsTheme, Material3 darkColorScheme
├── player/MiniPlayerBar.kt        ← persistent mini player bar
├── auth/LoginPromptSheet.kt       ← guest auth prompt sheet
├── billing/
│   ├── BillingHandler.kt          ← interface + SubscriptionProduct, PurchaseResult, RestoreResult
│   └── BillingRepository.kt       ← BillingRepository interface + BillingRepositoryImpl + product ID constants
└── di/
    ├── AppModule.kt               ← Koin module (ViewModels, repositories, shared scope)
    └── PlatformModule.kt          ← expect declarations (HttpClient, supabaseUrl, supabaseAnonKey, AudioPlayer)
androidMain/kotlin/com/trilium/syncpods/
├── MainActivity.kt                ← Android entry point, initializes Koin
├── player/AndroidAudioPlayer.kt   ← AudioPlayer impl using ExoPlayer (media3)
├── billing/AndroidBillingHandler.kt   ← BillingHandler impl (Google Play Billing 7)
└── di/
    └── PlatformModule.android.kt  ← actual Android implementations
iosMain/kotlin/com/trilium/syncpods/
├── billing/IOSBillingHandler.kt       ← BillingHandler impl (StoreKit 1)
└── di/
    └── PlatformModule.ios.kt      ← actual iOS implementations
```

**DI wiring:** All ViewModels are registered in `di/AppModule.kt` and retrieved in `AppShell.kt` via `koinViewModel<>()`. Screens receive `viewModel.feature` — no manual `remember { Feature(...) }` needed.

**AudioPlayer expect/actual:** `AudioPlayer` is an interface in commonMain with platform implementations: `AndroidAudioPlayer` (androidMain, uses ExoPlayer/media3) and `IOSAudioPlayer` (iosMain). Registered as a Koin single in `audioPlayerModule()`.

**BillingHandler expect/actual:** `BillingHandler` is an interface in commonMain with `AndroidBillingHandler` (androidMain, Google Play Billing 7) and `IOSBillingHandler` (iosMain, StoreKit 1 ObjC APIs) as platform implementations. `AndroidBillingHandler` holds a `WeakReference<Activity>` updated via `onActivityResumed`/`onActivityPaused` in `MainActivity`. `BillingRepository` wraps the handler and directly upserts `tier = 'paid'` in `user_profiles` on successful purchase. Registered via `billingHandlerModule()` — same expect/actual pattern as `audioPlayerModule()`.

**Naming note:** `BillingRepository` (IAP) is distinct from `podcastdetail.SubscriptionRepository` (podcast-follow). This naming was intentional to avoid Koin type conflicts.

**QueueRepository delegation:** `QueueRepository` has three implementations:
- `LocalQueueRepository` — guest queue stored via multiplatform-settings (SharedPreferences on Android)
- `SupabaseQueueRepository` — authenticated queue via Supabase
- `DelegatingQueueRepository` — switches between local/remote based on `client.auth.currentUserOrNull()`; migrates local queue to Supabase on sign-in

**Playlist feature (Library tab):** The Library tab hosts two sections — subscriptions strip and playlists list. Key files:
- `playlist/PlaylistModels.kt` — `Playlist`, `PlaylistEpisode`, `EpisodePayload` domain models
- `playlist/PlaylistRepository.kt` — interface + `SupabasePlaylistRepository` impl
- `library/LibraryFeature.kt` — full UDF pipeline; `LibraryScreen` sends `ScreenVisible` internally (no AppShell LaunchedEffect needed)
- `playlistdetail/PlaylistDetailViewModel.kt` — uses `SavedStateHandle.get<String>("id")` (same pattern as `PodcastDetailViewModel`) to extract the route arg; AppShell sends `ScreenVisible(viewModel.playlistId)`
- `addtoplaylist/AddToPlaylistViewModel.kt` — simple ViewModel (no StandardFeature) shared by PodcastDetail, Queue, and History screens via `koinViewModel<AddToPlaylistViewModel>()`; screens hold `var episodeForPlaylistSheet by remember { mutableStateOf<EpisodePayload?>(null) }` to drive `AddToPlaylistSheet`

### Class Design Rules

- **Features are pure**: no Android imports, no UI references, no side-effectful constructors
- **State is immutable**: always `data class` or `sealed class`; never `var` fields
- **Single source of truth**: UI reads only from `feature.state`; writes only via `feature.process(event)`
- **No business logic in screens**: Composables only map `State → UI` and forward gestures as `Events`
- **Effects over state flags**: use `Effect` for one-time actions; never use a `navigateTo: Boolean` in state

### Android ViewModel Convention

```kotlin
// commonMain
class LoginViewModel(scope: CoroutineScope = viewModelScope + Dispatchers.Default) : ViewModel() {
    val feature = LoginFeature(scope)
}
```

The ViewModel is a thin lifecycle owner — no logic lives here.

### Testing Standards

- **kotlin.test** — base assertions (`assertEquals`, `assertTrue`, `assertIs`)
- **Turbine** (`app.cash.turbine:turbine`) — test `StateFlow` / `Flow` emissions from `StandardFeature`
- **kotlinx-coroutines-test** — `runTest`, virtual time, `backgroundScope`
- Test doubles (fake classes) instead of MockK for repository mocking in commonTest

**Always use `backgroundScope` for the feature in tests** to prevent `UncompletedCoroutinesError` (the feature's event-processing pipeline runs indefinitely):

```kotlin
@Test
fun `loads trending on ScreenVisible`() = runTest {
    val repo = FakeRepository(result = listOf(item))
    val feature = DiscoverFeature(backgroundScope, repo, cache) // ← backgroundScope, not this

    feature.state.test {
        awaitItem() // consume initial state
        feature.process(DiscoverEvent.ScreenVisible)
        var latest = awaitItem()
        while (latest.isLoading || latest.trendingPodcasts.isEmpty()) latest = awaitItem()
        assertEquals(listOf(item), latest.trendingPodcasts)
        cancelAndIgnoreRemainingEvents()
    }
}
```

### Effects Pattern

`StandardFeature` does NOT have an `emitEffect()` method. Effects are managed with a private `MutableSharedFlow` inside the Feature subclass:

```kotlin
class MyFeature(...) : StandardFeature<...>(...) {
    private val _effects = MutableSharedFlow<MyEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<MyEffect> get() = _effects

    // Emit effects directly from actionToResult (not handleResult):
    is MyAction.Navigate -> flow<MyResult> {
        _effects.emit(MyEffect.NavigateTo(destination))
    }
}
```

`handleResult` only updates and returns `STATE` — it cannot emit effects.
