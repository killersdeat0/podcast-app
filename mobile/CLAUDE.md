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
│   └── <Feature>Screen.kt         ← @Composable UI, collects state, sends events
androidMain/kotlin/com/trilium/syncpods/
└── <feature>/
    └── <Feature>ViewModel.kt      ← ViewModel wrapper that owns a CoroutineScope for the Feature
```

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

- **kotlin.test** — base assertions (`assertEquals`, `assertTrue`)
- **Turbine** — test `StateFlow` / `Flow` emissions from `StandardFeature`
- **MockK** — mock repositories and dependencies
- **Truth** (optional, for readability) — `assertThat(x).isEqualTo(y)`

Test pattern:

```kotlin
@Test
fun loadsUsers() = runTest {
    val feature = LoginFeature(this)
    feature.state.test {
        assertThat(awaitItem()).isEqualTo(LoginState.Idle)
        feature.process(LoginEvent.Load)
        advanceUntilIdle()
        assertThat(awaitItem()).isEqualTo(LoginState.Loaded(...))
    }
    cancel()
}
```
