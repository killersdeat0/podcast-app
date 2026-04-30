# Playlist Feature — Mobile Design Spec

**Date:** 2026-04-30
**Branch:** reid-dev

## Context

The mobile app's Library tab is currently a stub ("Library — coming soon"). The web app already has a full playlist feature (create, manage, play). This spec brings feature parity to mobile: the Library tab becomes a real screen housing both playlists and subscriptions. The Supabase schema (`playlists`, `playlist_episodes` tables) already exists.

## Layout: Library Tab

Option C layout — subscriptions as a compact horizontal strip at the top, playlists as the primary content below.

```
Library
├── Subscribed Podcasts  (horizontal LazyRow, artwork + name)
└── Your Playlists       (vertical list, collage cover + name + episode count)
     └── [+ New Playlist button]
```

Tapping a subscription navigates to `PodcastDetail`. Tapping a playlist navigates to `PlaylistDetail`.

## Files

### New
```
commonMain/.../playlist/
  PlaylistModels.kt          — Playlist, PlaylistEpisode, EpisodePayload data classes
  PlaylistRepository.kt      — interface + SupabasePlaylistRepository impl
commonMain/.../library/
  LibraryFeature.kt          — STATE/EVENT/ACTION/RESULT/EFFECT + StandardFeature subclass
  LibraryScreen.kt           — subscriptions strip + playlists list composable
  LibraryViewModel.kt        — thin ViewModel wrapper
commonMain/.../playlistdetail/
  PlaylistDetailFeature.kt
  PlaylistDetailScreen.kt
  PlaylistDetailViewModel.kt
commonMain/.../addtoplaylist/
  AddToPlaylistViewModel.kt  — shared ViewModel for bottom sheet
  AddToPlaylistSheet.kt      — ModalBottomSheet composable
```

### Modified
```
navigation/AppRoutes.kt              — add PlaylistDetail(id) route
shell/AppShell.kt                    — wire LibraryScreen, add PlaylistDetail composable, remove stub
di/AppModule.kt                      — register PlaylistRepository, new ViewModels
podcastdetail/PodcastDetailScreen.kt — add "Add to Playlist" action on episode cards
queue/QueueScreen.kt                 — add "Add to Playlist" action on episode items
history/HistoryScreen.kt             — add "Add to Playlist" action on episode items
```

## Data Models

```kotlin
// playlist/PlaylistModels.kt

data class Playlist(
    val id: String,
    val name: String,
    val description: String?,
    val isPublic: Boolean,
    val position: Int,
    val episodeCount: Int,
    val artworkUrls: List<String>, // up to 4, for cover collage
)

data class PlaylistEpisode(
    val id: String,
    val guid: String,
    val feedUrl: String,
    val position: Int,
    val title: String,
    val podcastTitle: String,
    val artworkUrl: String?,
    val audioUrl: String,
    val durationSeconds: Int?,
    val positionSeconds: Int?,
    val positionPct: Float?,
    val completed: Boolean,
)

// Used when adding an episode to a playlist from any screen.
// Callers (PodcastDetail, Queue, History) map their local episode model to this type.
data class EpisodePayload(
    val guid: String,
    val feedUrl: String,
    val title: String,
    val podcastTitle: String,
    val artworkUrl: String?,
    val audioUrl: String,
    val durationSeconds: Int?,
)
```

## PlaylistRepository

```kotlin
interface PlaylistRepository {
    suspend fun getPlaylists(): List<Playlist>
    suspend fun createPlaylist(name: String, description: String? = null): Playlist
    suspend fun renamePlaylist(id: String, name: String)
    suspend fun deletePlaylist(id: String)
    suspend fun togglePublic(id: String, isPublic: Boolean)
    suspend fun reorderPlaylists(orderedIds: List<String>)
    suspend fun getPlaylistEpisodes(playlistId: String): List<PlaylistEpisode>
    suspend fun addEpisode(playlistId: String, episode: EpisodePayload)
    suspend fun removeEpisode(playlistId: String, guid: String)
    suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>)
}
```

Implementation: `SupabasePlaylistRepository` calling the existing Supabase `playlists` and `playlist_episodes` tables directly (same queries as the web API routes).

## LibraryFeature

```kotlin
data class LibraryState(
    val isLoading: Boolean = false,
    val playlists: List<Playlist> = emptyList(),
    val subscriptions: List<SubscriptionSummary> = emptyList(),
    val error: String? = null,
    val showCreateDialog: Boolean = false,
    val createDialogName: String = "",
    val tier: String = "free",
    val showLoginPrompt: Boolean = false,
)

sealed class LibraryEvent {
    data object ScreenVisible : LibraryEvent()
    data object CreatePlaylistTapped : LibraryEvent()
    data class CreateDialogNameChanged(val name: String) : LibraryEvent()
    data object CreateDialogConfirmed : LibraryEvent()
    data object CreateDialogDismissed : LibraryEvent()
    data class PlaylistTapped(val id: String) : LibraryEvent()
    data class PlaylistRenamed(val id: String, val name: String) : LibraryEvent()
    data class PlaylistDeleted(val id: String) : LibraryEvent()
    data class PlaylistsReordered(val orderedIds: List<String>) : LibraryEvent()
    data class SubscriptionTapped(val feedUrl: String) : LibraryEvent()
    data object LoginPromptDismissed : LibraryEvent()
}

sealed class LibraryEffect {
    data class NavigateToPlaylist(val id: String) : LibraryEffect()
    data class NavigateToPodcast(val feedUrl: String) : LibraryEffect()
}
```

- Loads subscriptions from existing `ProfileRepository` and playlists from `PlaylistRepository` on `ScreenVisible`
- Playlists list supports drag-to-reorder (same drag-handle pattern as `QueueScreen`); emits `PlaylistsReordered`
- Tier from `ProfileRepository.getUserTier()` — free tier cap: 3 playlists (create button disabled/hidden at limit)
- Guest users see a login prompt instead of playlists

## PlaylistDetailFeature

```kotlin
data class PlaylistDetailState(
    val isLoading: Boolean = false,
    val playlist: Playlist? = null,
    val episodes: List<PlaylistEpisode> = emptyList(),
    val error: String? = null,
    val isRenaming: Boolean = false,
    val renameText: String = "",
    val tier: String = "free",
)

sealed class PlaylistDetailEvent {
    data class ScreenVisible(val playlistId: String) : PlaylistDetailEvent()
    data class EpisodeTapped(val episode: PlaylistEpisode) : PlaylistDetailEvent()
    data class EpisodeRemoved(val guid: String) : PlaylistDetailEvent()
    data class EpisodesReordered(val orderedGuids: List<String>) : PlaylistDetailEvent()
    data object RenameTapped : PlaylistDetailEvent()
    data class RenameTextChanged(val name: String) : PlaylistDetailEvent()
    data object RenameConfirmed : PlaylistDetailEvent()
    data object RenameDismissed : PlaylistDetailEvent()
    data class PublicPrivateToggled(val isPublic: Boolean) : PlaylistDetailEvent()
    data object DeletePlaylistTapped : PlaylistDetailEvent()
    data object BackTapped : PlaylistDetailEvent()
}

sealed class PlaylistDetailEffect {
    data object NavigateBack : PlaylistDetailEffect()
    data class NavigateToPlayer(val episode: PlaylistEpisode) : PlaylistDetailEffect()
}
```

- Screen: collage cover (up to 4 episode artworks in a 2×2 grid), name, episode count, public/private chip
- Reorderable episode list — drag-handle pattern from `QueueScreen`
- Rename via inline dialog; delete with confirmation
- Optimistic updates for reorder (same pattern as `QueueFeature`)

## AddToPlaylistViewModel (Shared)

```kotlin
data class AddToPlaylistState(
    val playlists: List<Playlist> = emptyList(),
    val isLoading: Boolean = false,
    val addingToPlaylistId: String? = null, // spinner on tapped row
    val error: String? = null,
)

class AddToPlaylistViewModel : ViewModel() {
    val state: StateFlow<AddToPlaylistState>
    fun sheetOpened()
    fun addToPlaylist(playlistId: String, episode: EpisodePayload)
}
```

- `AddToPlaylistSheet` is a `ModalBottomSheet` taking `viewModel: AddToPlaylistViewModel` and `episode: EpisodePayload`
- Retrieved via `koinViewModel<AddToPlaylistViewModel>()` in PodcastDetail, Queue, and History screens — same Koin instance reused within a session
- Spinner on the tapped playlist row while in flight; sheet auto-dismisses on success
- Each calling screen maps its local episode type to `EpisodePayload` before opening the sheet

## Tier Limits

Mirrors the web:
- Free: max 3 playlists, max 10 episodes per playlist
- Paid: max 1000 playlists, max 500 episodes per playlist

Create button disabled (with upgrade CTA) when free-tier limit is reached.

## Navigation

New route: `AppRoutes.PlaylistDetail(val id: String)` — navigated to via `LibraryEffect.NavigateToPlaylist`.

The `ProfileScreen` "View All Subscriptions" stub (`ProfileAction.NavigateToViewAll`) should be wired to navigate to the Library tab instead of remaining a stub.

## Verification

1. **Library tab loads** — playlists and subscriptions appear; stub is gone
2. **Create playlist** — dialog appears, name required, playlist appears in list; free-tier user blocked at 3
3. **Rename/delete playlist** — works from Library list and from PlaylistDetail header
4. **Playlist detail** — episodes load, drag-to-reorder works, public/private toggle persists
5. **Add to Playlist** — bottom sheet appears from PodcastDetail, Queue, and History episode cards; episode appears in chosen playlist
6. **Subscription tap** — navigates to PodcastDetail for that podcast
7. **Profile "View All Subscriptions"** — navigates to Library tab
8. **Guest user** — Library shows login prompt instead of playlists
