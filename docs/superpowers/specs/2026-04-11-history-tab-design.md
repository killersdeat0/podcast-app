# History Tab — Design Spec

**Date:** 2026-04-11
**Platform:** Mobile (Compose Multiplatform)
**Status:** Approved

---

## Overview

Add a History tab to the SyncPods mobile app, positioned between Queue and Profile in the bottom navigation. The tab is only visible when the user is authenticated — it animates in/out as auth state changes. The screen shows a chronologically grouped list of listened episodes with two sub-tabs: All and In Progress.

---

## Data Model & Repository

### `HistoryItem`

Flat domain model with the episode join already resolved:

```kotlin
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
```

### `DateGroup`

```kotlin
data class DateGroup(val label: String, val items: List<HistoryItem>)
```

### `isInProgress` helper

Matches web `constants.ts` logic exactly:

```kotlin
fun HistoryItem.isInProgress() =
    !completed && positionSeconds > 30 && positionPct != null && positionPct < 98f
```

### `HistoryRepository` interface

```kotlin
interface HistoryRepository {
    suspend fun getHistory(isFreeTier: Boolean): List<HistoryItem>
}
```

### `SupabaseHistoryRepository` implementation

Mirrors web `/api/history` logic directly against Supabase (no HTTP call):

1. Query `playback_progress` filtered by `user_id`, `position_seconds > 0`, ordered `updated_at desc`.
2. If `isFreeTier`, add `gte('updated_at', 30DaysAgo)` filter.
3. Batch-fetch matching rows from `episodes` by guids.
4. Batch-fetch matching rows from `subscriptions` by feedUrls (for artwork fallback — subscription artwork takes priority over episode artwork, same as web).
5. Join and return as `List<HistoryItem>`.

---

## UDF Pipeline

### State

```kotlin
enum class HistoryTab { All, InProgress }

data class HistoryState(
    val allGroups: List<DateGroup> = emptyList(),
    val inProgressItems: List<HistoryItem> = emptyList(),
    val activeTab: HistoryTab = HistoryTab.All,
    val isLoading: Boolean = false,
    val error: String? = null,
)
```

### Events

```kotlin
sealed class HistoryEvent {
    data object ScreenVisible : HistoryEvent()
    data object RetryTapped : HistoryEvent()
    data class TabSelected(val tab: HistoryTab) : HistoryEvent()
    data class EpisodeTapped(val item: HistoryItem) : HistoryEvent()
}
```

### Actions

```kotlin
sealed class HistoryAction {
    data object Load : HistoryAction()
    data class SwitchTab(val tab: HistoryTab) : HistoryAction()
    data class PlayEpisode(val item: HistoryItem) : HistoryAction()
}
```

### Results

```kotlin
sealed class HistoryResult {
    data object Loading : HistoryResult()
    data class Loaded(val items: List<HistoryItem>) : HistoryResult()
    data class LoadError(val message: String) : HistoryResult()
    data class TabSwitched(val tab: HistoryTab) : HistoryResult()
}
```

### Effects

```kotlin
sealed class HistoryEffect {
    data class PlayEpisode(val item: HistoryItem) : HistoryEffect()
}
```

### Event → Action mapping

| Event | Action |
|---|---|
| `ScreenVisible` | `Load` |
| `RetryTapped` | `Load` |
| `TabSelected(tab)` | `SwitchTab(tab)` |
| `EpisodeTapped(item)` | `PlayEpisode(item)` |

### `actionToResult` logic

- **`Load`**: emits `Loading`, calls `ProfileRepository.getUserTier()` to determine `isFreeTier`, calls `HistoryRepository.getHistory(isFreeTier)`, emits `Loaded(items)` or `LoadError`.
- **`SwitchTab`**: emits `TabSwitched(tab)` — no re-fetch; both views derive from the already-loaded list.
- **`PlayEpisode`**: emits `HistoryEffect.PlayEpisode(item)` via `_effects`, emits no `Result`.

### `handleResult` logic

- **`Loaded`**: groups items into `DateGroup`s and filters `inProgressItems`:
  - **Today**: `updatedAt` calendar day == today
  - **This Week**: within last 7 days but not today
  - **Earlier**: older than 7 days
  - Groups with zero items are omitted.
  - `inProgressItems` = items where `isInProgress()` is true, preserving `updated_at desc` order.
- **`TabSwitched`**: updates `activeTab` only.
- **`Loading`**: sets `isLoading = true`, clears `error`.
- **`LoadError`**: sets `isLoading = false`, sets `error`.

### `HistoryViewModel`

Thin lifecycle owner — no logic:

```kotlin
class HistoryViewModel(
    private val repository: HistoryRepository,
    private val profileRepository: ProfileRepository,
    scope: CoroutineScope = viewModelScope + Dispatchers.Default,
) : ViewModel() {
    val feature = HistoryFeature(scope, repository, profileRepository)
}
```

---

## UI — `HistoryScreen`

### Signature

```kotlin
@Composable
fun HistoryScreen(
    feature: HistoryFeature,
    onPlayEpisode: (NowPlaying) -> Unit,
    modifier: Modifier = Modifier,         // receives top padding from AppShell
    bottomContentPadding: Dp = 0.dp,       // accounts for MiniPlayerBar + NavBar height
)
```

### Layout

```
Column
├── Header row
│   ├── "History" — bold title
│   └── Tab pills: "All" | "In Progress"
│       └── Active: primary background + onPrimary text
│       └── Inactive: onSurfaceVariant text, no background
└── LazyColumn (contentPadding bottom = bottomContentPadding)
    ├── [All tab] — DateGroup sections
    │   ├── Section header: "TODAY · 1 EPISODE"
    │   │   (labelSmall, uppercase, onSurfaceVariant, 16dp top padding)
    │   └── EpisodeRow cards per item
    ├── [InProgress tab] — flat list of EpisodeRow cards
    ├── Loading state: shimmer skeleton placeholders
    └── Empty state: centered message, no CTA needed (auth-gated)
```

### `EpisodeRow` card

- `Card` with `surfaceVariant` background, `12.dp` corner radius
- Leading: `AsyncImage` 48×48dp rounded, placeholder on failure
- Body:
  - Episode title — 1 line, truncated, `bodyMedium`
  - Subtitle row: `podcastTitle · duration · ✓ PLAYED badge`
- `✓ PLAYED` badge shown when `completed || (positionPct != null && positionPct >= 98f)` — `labelSmall`, uppercase, `onSurfaceVariant`
- Tap → `HistoryEvent.EpisodeTapped(item)`

### Effect consumption in `HistoryScreen`

`HistoryScreen` collects `feature.effects` and converts `HistoryEffect.PlayEpisode(item)` to a `NowPlaying` inline before calling `onPlayEpisode(nowPlaying)`. All required fields (`guid`, `feedUrl`, `title`, `podcastTitle`, `artworkUrl`, `audioUrl`, `durationSeconds`) are present on `HistoryItem`. This mirrors the same conversion `QueueScreen` does for `QueueEffect.PlayEpisode`.

### MiniPlayer compatibility

The `MiniPlayerBar` lives in `AppShell`'s `Scaffold` `bottomBar` and is already rendered for all screens. `HistoryScreen` applies `bottomContentPadding` to its `LazyColumn` so the last list item scrolls clear of both the mini player and the nav bar — identical to `QueueScreen` and `ProfileScreen`.

---

## Navigation & AppShell Changes

### `AppRoutes.kt`

Add:
```kotlin
data object History : AppRoutes("history")
```

### `AppShell.kt`

**1. Auth-reactive state:**
```kotlin
val sessionStatus by supabaseClient.auth.sessionStatus.collectAsState()
val isAuthenticated = sessionStatus is SessionStatus.Authenticated
```

**2. `TabItem` gains a `visible` field:**
```kotlin
private data class TabItem(
    val route: String,
    val label: String,
    val icon: @Composable () -> Unit,
    val visible: Boolean = true,
)
```

History tab inserted between Queue and Profile:
```kotlin
TabItem(AppRoutes.History.route, "History", { Icon(...) }, visible = isAuthenticated),
```

**3. NavigationBar rendering uses `AnimatedVisibility` per item:**
```kotlin
tabs.forEach { tab ->
    AnimatedVisibility(
        visible = tab.visible,
        enter = fadeIn() + expandHorizontally(),
        exit = fadeOut() + shrinkHorizontally(),
    ) {
        NavigationBarItem(
            selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true,
            onClick = { navController.navigate(tab.route) { ... } },
            icon = tab.icon,
            label = { Text(tab.label) },
        )
    }
}
```

Surrounding tabs shift smoothly as History slides in or out.

**4. `NavHost` — add History composable:**
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

### `AppModule.kt`

```kotlin
single<HistoryRepository> { SupabaseHistoryRepository(supabaseClient = get()) }
viewModel { HistoryViewModel(get(), get()) }  // HistoryRepository, ProfileRepository
```

---

## Files Created / Modified

| File | Change |
|---|---|
| `history/HistoryFeature.kt` | New — STATE, EVENT, ACTION, RESULT, EFFECT + `StandardFeature` subclass |
| `history/HistoryScreen.kt` | New — Composable UI |
| `history/HistoryViewModel.kt` | New — thin ViewModel wrapper |
| `history/HistoryRepository.kt` | New — interface + `SupabaseHistoryRepository` impl |
| `navigation/AppRoutes.kt` | Add `History` route |
| `shell/AppShell.kt` | Auth-conditional tab + animation + NavHost entry |
| `di/AppModule.kt` | Register `HistoryRepository` and `HistoryViewModel` |

---

## Out of Scope

- Progress bar overlay on episode cards (not shown in design reference)
- Add-to-playlist action (web-only for now)
- Description expand/collapse (web-only for now)
- History for guest users (tab hidden when not authenticated)
