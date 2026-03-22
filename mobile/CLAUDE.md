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
│   └── PodcastRepository.kt       ← data layer interfaces
├── components/                    ← reusable composables (PodcastCard, etc.)
├── navigation/AppRoutes.kt        ← sealed class route definitions
├── shell/AppShell.kt              ← Scaffold + NavigationBar + NavHost
├── player/MiniPlayerBar.kt        ← persistent player bar (stub)
├── auth/LoginPromptSheet.kt       ← guest auth prompt
└── di/
    ├── AppModule.kt               ← Koin module (common dependencies)
    └── PlatformModule.kt          ← expect declarations (HttpClient, supabaseUrl, supabaseAnonKey)
androidMain/kotlin/com/trilium/syncpods/
├── <feature>/
│   └── <Feature>ViewModel.kt      ← ViewModel wrapper that owns a CoroutineScope for the Feature
└── di/
    └── PlatformModule.android.kt  ← actual Android implementations
iosMain/kotlin/com/trilium/syncpods/
└── di/
    └── PlatformModule.ios.kt      ← actual iOS implementations
```

**Note on DiscoverScreen/AppShell composables**: these accept a `DiscoverFeature` parameter created in the NavHost composable using `remember { DiscoverFeature(rememberCoroutineScope(), repository) }`. The `DiscoverViewModel` in androidMain exists for config-change survival on Android but is not currently wired into the NavHost.

### Class Design Rules

- **Features are pure**: no Android imports, no UI references, no side-effectful constructors
- **State is immutable**: always `data class` or `sealed class`; never `var` fields
- **Single source of truth**: UI reads only from `feature.state`; writes only via `feature.process(event)`
- **No business logic in screens**: Composables only map `State → UI` and forward gestures as `Events`
- **Effects over state flags**: use `Effect` for one-time actions; never use a `navigateTo: Boolean` in state

### Android ViewModel Convention

```kotlin
// androidMain
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
    val feature = DiscoverFeature(backgroundScope, repo) // ← backgroundScope, not this

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
