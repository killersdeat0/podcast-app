# Plan: Discover Screen — Mobile (Compose Multiplatform)

## Progress

| # | Step | Summary | Done |
|---|------|---------|------|
| 1 | Data Models | `PodcastSummary`, `Genre`, `PODCAST_GENRES` constants in `commonMain` | ☐ |
| 2 | podcasts-trending Edge Function | New Supabase Edge Function for top charts + genre-filtered trending | ☐ |
| 3 | PodcastRepository | Interface + Ktor-backed impl calling search & trending edge functions | ☐ |
| 4 | Koin DI Setup | `AppModule` wiring repository; `startKoin` in Android + iOS entry points | ☐ |
| 5 | Navigation Infrastructure | `AppRoutes` sealed class + `NavHost` in `App.kt` (replaces placeholder) | ☐ |
| 6 | App Shell + Bottom Nav | `AppShell` with 4-tab `NavigationBar` and mini player slot via `Scaffold` | ☐ |
| 7 | DiscoverFeature (UDF) | State/Event/Effect + `StandardFeature` subclass with 300ms search debounce | ☐ |
| 8 | DiscoverViewModel | Thin Android `ViewModel` wrapper owning the feature's coroutine scope | ☐ |
| 9 | PodcastCard Component | Reusable Coil artwork card used in 2-column `LazyVerticalGrid` | ☐ |
| 10 | DiscoverScreen UI | Search bar, genre chips, trending/results grid, loading + error states | ☐ |
| 11 | Mini Player Bar | Full UI (artwork, title, play/pause) wired to stub `NowPlaying` state | ☐ |
| 12 | Login Prompt Sheet | `ModalBottomSheet` with contextual message + Sign In / Create Account / Not Now | ☐ |
| 13 | Unit Tests | `DiscoverFeatureTest` covering load, debounce, genre filter, nav effect | ☐ |

---

## Context
The mobile app is currently a minimal KMP scaffold (Material3 theme + Supabase client configured, zero feature screens). This plan implements the **Discover screen** and all dependencies required to display it: navigation shell, podcast data models, API/repository layer, UDF feature, UI components, mini player stub, and the login prompt sheet.

The Discover screen is the first "real" screen in the app, so it implicitly bootstraps the entire navigation and app shell infrastructure.

---

## Step 1 — Data Models (`commonMain`)

**File:** `commonMain/.../discover/DiscoverModels.kt`

Define immutable data classes:

```kotlin
@Serializable
data class PodcastSummary(
    val id: Long,               // iTunes trackId
    val title: String,          // collectionName
    val artistName: String,
    val artworkUrl: String,     // artworkUrl600 ?? artworkUrl100
    val feedUrl: String,
    val genres: List<String>,
    val primaryGenre: String,
)

data class Genre(val id: Int, val label: String)

val PODCAST_GENRES = listOf(
    Genre(0, "All"), Genre(1303, "Comedy"), Genre(1318, "Technology"),
    Genre(1489, "News"), Genre(1488, "True Crime"), Genre(1321, "Business"),
    Genre(1304, "Education"), Genre(1324, "Society & Culture"),
    Genre(1545, "Sports"), Genre(1512, "Health & Fitness"),
)
```

Map from the raw iTunes JSON fields (`collectionName`, `artworkUrl600`, `feedUrl`, etc.) in a helper function.

---

## Step 2 — `podcasts-trending` Edge Function (`supabase/functions/`)

**File:** `supabase/functions/podcasts-trending/index.ts`

The web uses a Next.js API route; mobile needs a Supabase Edge Function (per phase-3a architecture).

- `GET ?genreId=<id>` → `fetchPodcastsByGenre(genreId)` (iTunes search with `term=podcast&genreId=X`)
- `GET` (no genreId) → `fetchTopPodcasts()` (Apple top charts RSS → iTunes lookup enrichment)

Mirrors logic from `web/src/lib/itunes/trending.ts` and `web/src/app/api/podcasts/trending/route.ts`.
Returns `{ results: ItunesResult[] }` — same shape as `podcasts-search`.

---

## Step 3 — PodcastRepository (`commonMain`)

**File:** `commonMain/.../discover/PodcastRepository.kt`

```kotlin
interface PodcastRepository {
    suspend fun searchPodcasts(query: String, genreId: Int? = null): List<PodcastSummary>
    suspend fun fetchTrending(genreId: Int? = null): List<PodcastSummary>
}
```

**File:** `commonMain/.../discover/PodcastRepositoryImpl.kt`

- Uses Ktor `HttpClient` (injected via Koin — declared in `PlatformModule`)
- `searchPodcasts` → `GET $supabaseUrl/functions/v1/podcasts-search?q={query}` (add `Authorization: Bearer $anonKey` header)
- `fetchTrending` → `GET $supabaseUrl/functions/v1/podcasts-trending?genreId={id}`
- Parse response with `kotlinx.serialization`
- `supabaseUrl` and `anonKey` injected via `PlatformModule` expect/actual declarations

---

## Step 4 — Koin DI Setup (`commonMain` + platform)

**Files:**
- `commonMain/.../di/AppModule.kt` — common Koin module
- `commonMain/.../di/PlatformModule.kt` — `expect` declarations (`HttpClient`, `supabaseUrl`, `anonKey`)
- `androidMain/.../di/PlatformModule.android.kt` — `actual` Android implementations
- `iosMain/.../di/PlatformModule.ios.kt` — `actual` iOS implementations

```kotlin
// commonMain
val appModule = module {
    single<PodcastRepository> { PodcastRepositoryImpl(get(), get(), get()) }
}
```

Wire `startKoin { modules(platformModule, appModule) }` in `MainActivity.onCreate()` (androidMain) and `MainViewController` factory (iosMain).

---

## Step 5 — Navigation Infrastructure (`commonMain`)

**File:** `commonMain/.../navigation/AppRoutes.kt`

```kotlin
sealed class AppRoutes(val route: String) {
    data object Discover : AppRoutes("discover")
    data object Library  : AppRoutes("library")
    data object Queue    : AppRoutes("queue")
    data object Profile  : AppRoutes("profile")
    data class PodcastDetail(val feedUrl: String) : AppRoutes("podcast/{feedUrl}") {
        companion object { const val ROUTE = "podcast/{feedUrl}" }
    }
}
```

**File:** `commonMain/.../App.kt` (replace current placeholder)

- Create `NavController` and `NavHost`
- Start at `AppShell` (guest browsing is allowed — no auth gate at app start)

---

## Step 6 — App Shell + Bottom Nav (`commonMain`)

**File:** `commonMain/.../shell/AppShell.kt`

- `Scaffold` with `bottomBar` containing both `MiniPlayerBar` and `NavigationBar` stacked vertically
- Four `NavigationBarItem`s: Discover (search icon), Library (library icon), Queue (list icon), Profile (person icon)
- `NavHost` nested inside content area, inner `NavController` drives tab destinations
- Highlight active tab based on current back-stack entry
- `DiscoverFeature` created via `remember { DiscoverFeature(rememberCoroutineScope(), repository) }` inside the NavHost composable

---

## Step 7 — DiscoverFeature (UDF) (`commonMain`)

**File:** `commonMain/.../discover/DiscoverFeature.kt`

```kotlin
data class DiscoverState(
    val query: String = "",
    val selectedGenreId: Int = 0,
    val trendingPodcasts: List<PodcastSummary> = emptyList(),
    val searchResults: List<PodcastSummary> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

sealed class DiscoverEvent {
    data class QueryChanged(val query: String) : DiscoverEvent()
    data class GenreSelected(val genreId: Int) : DiscoverEvent()
    data class PodcastTapped(val podcast: PodcastSummary) : DiscoverEvent()
    data object ScreenVisible : DiscoverEvent()
}

sealed class DiscoverEffect {
    data class NavigateToPodcastDetail(val feedUrl: String) : DiscoverEffect()
}
```

- **Actions:** `LoadTrending(genreId)`, `Search(query, genreId)`
- **Results:** `TrendingLoaded(list)`, `SearchResultsLoaded(list)`, `SetLoading(bool)`, `SetError(msg)`
- `eventToAction`: `QueryChanged` → debounced via `debounce(300)` on the actions flow → `Search`; `GenreSelected` → `LoadTrending` or `Search` based on active query; `ScreenVisible` → `LoadTrending`; `PodcastTapped` → emits effect directly from `actionToResult`
- Effects emitted via private `MutableSharedFlow<DiscoverEffect>(extraBufferCapacity = 8)` inside the Feature class (see `mobile/CLAUDE.md` — `StandardFeature` has no `emitEffect()` method)

---

## Step 8 — DiscoverViewModel (`androidMain`)

**File:** `androidMain/.../discover/DiscoverViewModel.kt`

```kotlin
class DiscoverViewModel(
    scope: CoroutineScope = viewModelScope + Dispatchers.Default,
    repository: PodcastRepository = get()
) : ViewModel() {
    val feature = DiscoverFeature(scope, repository)
}
```

Exists for config-change survival on Android; not currently wired into the NavHost (feature is created via `remember` there instead).

---

## Step 9 — PodcastCard Component (`commonMain`)

**File:** `commonMain/.../components/PodcastCard.kt`

- Artwork image via `AsyncImage` (Coil 3.x)
- Podcast title (1 line, ellipsis)
- Artist name (muted, 1 line)
- Rounded corners, `surfaceContainer` background
- Used in 2-column `LazyVerticalGrid`

---

## Step 10 — DiscoverScreen UI (`commonMain`)

**File:** `commonMain/.../discover/DiscoverScreen.kt`

Layout (top-to-bottom):
1. **Title** — "Discover" heading
2. **Search bar** — Material3 `SearchBar`, placeholder "Search podcasts, episodes...", forwards `QueryChanged` event; debounce handled in Feature
3. **Genre chips** — `LazyRow` of `FilterChip`s, shown always; tapping sends `GenreSelected`
4. **Content area** (two states):
   - `query.isBlank()` → "Trending" heading + `LazyVerticalGrid(columns = 2)` of `PodcastCard`
   - `query.isNotBlank()` → search results `LazyVerticalGrid(columns = 2)`
5. Loading indicator (`CircularProgressIndicator`) while `isLoading`
6. Error text if `error != null`

Collects `feature.state` via `collectAsState()`. Handles `NavigateToPodcastDetail` effect via `LaunchedEffect`.

---

## Step 11 — Mini Player Bar (`commonMain`)

**File:** `commonMain/.../player/MiniPlayerBar.kt`

A persistent composable bar rendered in `AppShell` above the bottom nav:
- Height ~64dp, `surfaceContainer` background
- Left: artwork thumbnail (placeholder box when null)
- Center: episode title + podcast name (`"Nothing playing"` / `""` when null)
- Right: play/pause `IconButton`
- Tap anywhere → navigates to Full Player route (stubbed — Full Player is a future phase)
- Accepts a `NowPlaying?` parameter; hidden entirely when null

Accepts a stub `NowPlaying` data class for now; will be replaced when `PlayerFeature` is implemented.

---

## Step 12 — Login Prompt Sheet (`commonMain`)

**File:** `commonMain/.../auth/LoginPromptSheet.kt`

```kotlin
enum class LoginPromptReason { SUBSCRIBE, SAVE_QUEUE, PROFILE }

@Composable
fun LoginPromptSheet(
    reason: LoginPromptReason,
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
    onDismiss: () -> Unit,
)
```

- `ModalBottomSheet` (Material3)
- Contextual message per `reason` (e.g., "Sign in to follow podcasts")
- "Sign In" filled button → `onSignIn()`
- "Create Account" outline button → `onCreateAccount()`
- "Not now" text button → `onDismiss()`

Navigation to Login/SignUp is handled by the caller via nav args.

---

## Step 13 — Unit Tests (`commonTest`)

**File:** `commonTest/.../discover/DiscoverFeatureTest.kt`

Uses Turbine + `kotlinx-coroutines-test`. **Repository is faked with a `FakeDiscoverRepository` class** (no MockK in `commonTest`). Always pass `backgroundScope` to the feature to avoid `UncompletedCoroutinesError`.

```kotlin
@Test
fun `loads trending on screen visible`() = runTest {
    val repo = FakeDiscoverRepository(trending = listOf(item))
    val feature = DiscoverFeature(backgroundScope, repo)
    feature.state.test {
        awaitItem() // initial
        feature.process(DiscoverEvent.ScreenVisible)
        var latest = awaitItem()
        while (latest.isLoading || latest.trendingPodcasts.isEmpty()) latest = awaitItem()
        assertEquals(listOf(item), latest.trendingPodcasts)
        cancelAndIgnoreRemainingEvents()
    }
}
```

Additional tests:
- `` `search debounced` `` — rapid `QueryChanged` events produce one network call after 300ms
- `` `genre filter reloads trending` `` — `GenreSelected(1303)` triggers `LoadTrending(1303)`
- `` `podcast tapped emits navigation effect` `` — assert `NavigateToPodcastDetail(feedUrl)` on effects flow

---

## Critical Files

| File | Notes |
|------|-------|
| `supabase/functions/podcasts-trending/index.ts` | New edge function (mirrors web trending route) |
| `commonMain/.../discover/DiscoverModels.kt` | Podcast data classes + genre list |
| `commonMain/.../discover/PodcastRepository.kt` + `Impl` | Ktor HTTP calls to edge functions |
| `commonMain/.../di/AppModule.kt` + `PlatformModule` | Koin DI wiring |
| `commonMain/.../navigation/AppRoutes.kt` | Route definitions |
| `commonMain/.../App.kt` | NavHost root (replaces placeholder) |
| `commonMain/.../shell/AppShell.kt` | Bottom nav + mini player slot |
| `commonMain/.../discover/DiscoverFeature.kt` | UDF state machine |
| `commonMain/.../discover/DiscoverScreen.kt` | Composable UI |
| `androidMain/.../discover/DiscoverViewModel.kt` | Android lifecycle wrapper |
| `commonMain/.../components/PodcastCard.kt` | Reusable podcast card |
| `commonMain/.../player/MiniPlayerBar.kt` | Persistent mini player (full UI, stub state) |
| `commonMain/.../auth/LoginPromptSheet.kt` | Guest login prompt bottom sheet |
| `commonTest/.../discover/DiscoverFeatureTest.kt` | Feature unit tests |

---

## Verification

1. `./gradlew :composeApp:assembleDebug` — clean build, no compile errors
2. Run on Android emulator: Discover tab shows genre chips + trending grid on launch
3. Type in search bar → trending replaced by search results after ~300ms debounce
4. Tap genre chip → trending grid refreshes for that genre
5. Tap a podcast card → navigates to Podcast Detail route
6. Mini player bar visible above bottom nav with "Nothing playing" state
7. `./gradlew :composeApp:allTests` — all `DiscoverFeatureTest` tests pass