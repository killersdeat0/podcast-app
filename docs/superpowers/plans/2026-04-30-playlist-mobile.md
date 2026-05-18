# Playlist Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Playlist feature on the mobile Library tab — replacing the "coming soon" stub with a full playlists-and-subscriptions screen, playlist detail, drag-to-reorder, and "Add to Playlist" actions on episode cards throughout the app.

**Architecture:** Feature-per-screen UDF pipeline (StandardFeature subclasses) following the existing QueueFeature and HistoryFeature patterns. A shared `AddToPlaylistViewModel` (simple ViewModel, not a full Feature) is retrieved via Koin from PodcastDetail, Queue, and History screens to avoid duplicating playlist-fetch logic. The Supabase `playlists` and `playlist_episodes` tables already exist.

**Tech Stack:** Kotlin Multiplatform, Compose Multiplatform, Supabase Kotlin, Koin, composure `arch` library (StandardFeature), Turbine for Flow testing, kotlin.test

---

## File Map

**New files:**
```
commonMain/.../playlist/PlaylistModels.kt
commonMain/.../playlist/PlaylistRepository.kt
commonMain/.../library/LibraryFeature.kt
commonMain/.../library/LibraryViewModel.kt
commonMain/.../library/LibraryScreen.kt
commonMain/.../playlistdetail/PlaylistDetailFeature.kt
commonMain/.../playlistdetail/PlaylistDetailViewModel.kt
commonMain/.../playlistdetail/PlaylistDetailScreen.kt
commonMain/.../addtoplaylist/AddToPlaylistViewModel.kt
commonMain/.../addtoplaylist/AddToPlaylistSheet.kt
commonTest/.../library/LibraryFeatureTest.kt
commonTest/.../playlistdetail/PlaylistDetailFeatureTest.kt
```

**Modified files:**
```
navigation/AppRoutes.kt
shell/AppShell.kt
di/AppModule.kt
podcastdetail/PodcastDetailScreen.kt
queue/QueueScreen.kt
history/HistoryScreen.kt
profile/ProfileFeature.kt   (wire View All Subscriptions stub)
```

Base path for all source files: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/`
Base path for all test files: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/`

---

## Task 1: Data Models + PlaylistRepository Interface

**Files:**
- Create: `commonMain/.../playlist/PlaylistModels.kt`
- Create: `commonMain/.../playlist/PlaylistRepository.kt`

- [x] **Step 1: Create PlaylistModels.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlist/PlaylistModels.kt
package com.trilium.syncpods.playlist

data class Playlist(
    val id: String,
    val name: String,
    val description: String?,
    val isPublic: Boolean,
    val position: Int,
    val episodeCount: Int,
    val artworkUrls: List<String>, // up to 4, for 2×2 collage cover
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

// Payload for adding an episode to a playlist from any screen.
// Callers map their local episode model to this before calling addEpisode.
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

- [x] **Step 2: Create PlaylistRepository.kt interface**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlist/PlaylistRepository.kt
package com.trilium.syncpods.playlist

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

- [x] **Step 3: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlist/
git commit -m "feat: add PlaylistModels and PlaylistRepository interface"
```

---

## Task 2: SupabasePlaylistRepository

**Files:**
- Modify: `commonMain/.../playlist/PlaylistRepository.kt` (append implementation)

- [x] **Step 1: Add Supabase row types and SupabasePlaylistRepository to PlaylistRepository.kt**

Append to the bottom of `PlaylistRepository.kt`:

```kotlin
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Row types ─────────────────────────────────────────────────────────────────

@Serializable
private data class PlaylistRow(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("is_public") val isPublic: Boolean = false,
    @SerialName("position") val position: Int = 0,
)

@Serializable
private data class PlaylistInsertRow(
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("is_public") val isPublic: Boolean = false,
    @SerialName("position") val position: Int,
    @SerialName("user_id") val userId: String,
)

@Serializable
private data class PlaylistEpisodeLinkRow(
    @SerialName("id") val id: String,
    @SerialName("playlist_id") val playlistId: String,
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position") val position: Int,
)

@Serializable
private data class PlaylistEpisodeInsertRow(
    @SerialName("playlist_id") val playlistId: String,
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position") val position: Int,
)

@Serializable
private data class EpisodeMetaRow(
    @SerialName("guid") val guid: String,
    @SerialName("title") val title: String? = null,
    @SerialName("audio_url") val audioUrl: String? = null,
    @SerialName("duration") val duration: Int? = null,
    @SerialName("artwork_url") val artworkUrl: String? = null,
    @SerialName("podcast_title") val podcastTitle: String? = null,
)

@Serializable
private data class EpisodeUpsertRow(
    @SerialName("guid") val guid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("title") val title: String,
    @SerialName("audio_url") val audioUrl: String,
    @SerialName("duration") val duration: Int?,
    @SerialName("podcast_title") val podcastTitle: String,
    @SerialName("artwork_url") val artworkUrl: String?,
)

@Serializable
private data class ProgressDetailRow(
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("position_seconds") val positionSeconds: Int,
    @SerialName("position_pct") val positionPct: Float? = null,
    @SerialName("completed") val completed: Boolean = false,
)

@Serializable
private data class PositionRow(@SerialName("position") val position: Int)

// ── Implementation ────────────────────────────────────────────────────────────

class SupabasePlaylistRepository(
    private val supabaseClient: SupabaseClient,
) : PlaylistRepository {

    override suspend fun getPlaylists(): List<Playlist> = coroutineScope {
        val playlistRows = supabaseClient.from("playlists")
            .select(Columns.list("id", "name", "description", "is_public", "position")) {
                order("position", order = Order.ASCENDING)
            }.decodeList<PlaylistRow>()

        if (playlistRows.isEmpty()) return@coroutineScope emptyList()
        val ids = playlistRows.map { it.id }

        val linkRows = supabaseClient.from("playlist_episodes")
            .select(Columns.list("id", "playlist_id", "episode_guid", "feed_url", "position")) {
                filter { isIn("playlist_id", ids) }
                order("position", order = Order.ASCENDING)
            }.decodeList<PlaylistEpisodeLinkRow>()

        val allGuids = linkRows.map { it.episodeGuid }.distinct()
        val artworkMap = if (allGuids.isNotEmpty()) {
            supabaseClient.from("episodes")
                .select(Columns.list("guid", "artwork_url")) {
                    filter { isIn("guid", allGuids) }
                }.decodeList<EpisodeMetaRow>().associate { it.guid to it.artworkUrl }
        } else emptyMap()

        val linksByPlaylist = linkRows.groupBy { it.playlistId }

        playlistRows.map { row ->
            val links = linksByPlaylist[row.id] ?: emptyList()
            val artworkUrls = links.take(4).mapNotNull { artworkMap[it.episodeGuid] }
            Playlist(
                id = row.id,
                name = row.name,
                description = row.description,
                isPublic = row.isPublic,
                position = row.position,
                episodeCount = links.size,
                artworkUrls = artworkUrls,
            )
        }
    }

    override suspend fun createPlaylist(name: String, description: String?): Playlist {
        val userId = supabaseClient.auth.currentUserOrNull()?.id ?: throw Exception("Not authenticated")
        val positions = supabaseClient.from("playlists")
            .select(Columns.list("position")) { }
            .decodeList<PositionRow>()
        val nextPosition = (positions.maxOfOrNull { it.position } ?: -1) + 1
        val row = supabaseClient.from("playlists").insert(
            PlaylistInsertRow(name = name, description = description, isPublic = false, position = nextPosition, userId = userId)
        ) { select() }.decodeSingle<PlaylistRow>()
        return Playlist(id = row.id, name = row.name, description = row.description, isPublic = row.isPublic, position = row.position, episodeCount = 0, artworkUrls = emptyList())
    }

    override suspend fun renamePlaylist(id: String, name: String) {
        supabaseClient.from("playlists").update({ set("name", name) }) {
            filter { eq("id", id) }
        }
    }

    override suspend fun deletePlaylist(id: String) {
        supabaseClient.from("playlists").delete { filter { eq("id", id) } }
    }

    override suspend fun togglePublic(id: String, isPublic: Boolean) {
        supabaseClient.from("playlists").update({ set("is_public", isPublic) }) {
            filter { eq("id", id) }
        }
    }

    override suspend fun reorderPlaylists(orderedIds: List<String>) {
        coroutineScope {
            orderedIds.mapIndexed { index, id ->
                async {
                    supabaseClient.from("playlists").update({ set("position", index) }) {
                        filter { eq("id", id) }
                    }
                }
            }.awaitAll()
        }
    }

    override suspend fun getPlaylistEpisodes(playlistId: String): List<PlaylistEpisode> = coroutineScope {
        val linkRows = supabaseClient.from("playlist_episodes")
            .select(Columns.list("id", "playlist_id", "episode_guid", "feed_url", "position")) {
                filter { eq("playlist_id", playlistId) }
                order("position", order = Order.ASCENDING)
            }.decodeList<PlaylistEpisodeLinkRow>()

        if (linkRows.isEmpty()) return@coroutineScope emptyList()
        val guids = linkRows.map { it.episodeGuid }

        val episodesDeferred = async {
            supabaseClient.from("episodes")
                .select(Columns.list("guid", "title", "audio_url", "duration", "artwork_url", "podcast_title")) {
                    filter { isIn("guid", guids) }
                }.decodeList<EpisodeMetaRow>().associateBy { it.guid }
        }
        val progressDeferred = async {
            supabaseClient.from("playback_progress")
                .select(Columns.list("episode_guid", "position_seconds", "position_pct", "completed")) {
                    filter { isIn("episode_guid", guids) }
                }.decodeList<ProgressDetailRow>().associateBy { it.episodeGuid }
        }

        val episodeMap = episodesDeferred.await()
        val progressMap = progressDeferred.await()

        linkRows.mapNotNull { link ->
            val ep = episodeMap[link.episodeGuid] ?: return@mapNotNull null
            val audioUrl = ep.audioUrl ?: return@mapNotNull null
            val progress = progressMap[link.episodeGuid]
            PlaylistEpisode(
                id = link.id,
                guid = link.episodeGuid,
                feedUrl = link.feedUrl,
                position = link.position,
                title = ep.title ?: "",
                podcastTitle = ep.podcastTitle ?: "",
                artworkUrl = ep.artworkUrl,
                audioUrl = audioUrl,
                durationSeconds = ep.duration,
                positionSeconds = progress?.positionSeconds,
                positionPct = progress?.positionPct,
                completed = progress?.completed ?: false,
            )
        }
    }

    override suspend fun addEpisode(playlistId: String, episode: EpisodePayload) {
        supabaseClient.from("episodes").upsert(
            EpisodeUpsertRow(
                guid = episode.guid, feedUrl = episode.feedUrl, title = episode.title,
                audioUrl = episode.audioUrl, duration = episode.durationSeconds,
                podcastTitle = episode.podcastTitle, artworkUrl = episode.artworkUrl,
            )
        ) { onConflict = "feed_url,guid" }
        val positions = supabaseClient.from("playlist_episodes")
            .select(Columns.list("position")) { filter { eq("playlist_id", playlistId) } }
            .decodeList<PositionRow>()
        val nextPosition = (positions.maxOfOrNull { it.position } ?: -1) + 1
        supabaseClient.from("playlist_episodes").upsert(
            PlaylistEpisodeInsertRow(playlistId = playlistId, episodeGuid = episode.guid, feedUrl = episode.feedUrl, position = nextPosition)
        ) { onConflict = "playlist_id,episode_guid" }
    }

    override suspend fun removeEpisode(playlistId: String, guid: String) {
        supabaseClient.from("playlist_episodes").delete {
            filter { eq("playlist_id", playlistId); eq("episode_guid", guid) }
        }
    }

    override suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>) {
        coroutineScope {
            orderedGuids.mapIndexed { index, guid ->
                async {
                    supabaseClient.from("playlist_episodes").update({ set("position", index) }) {
                        filter { eq("playlist_id", playlistId); eq("episode_guid", guid) }
                    }
                }
            }.awaitAll()
        }
    }
}
```

- [x] **Step 2: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlist/PlaylistRepository.kt
git commit -m "feat: add SupabasePlaylistRepository"
```

---

## Task 3: LibraryFeature + Tests

**Files:**
- Create: `commonMain/.../library/LibraryFeature.kt`
- Create: `commonTest/.../library/LibraryFeatureTest.kt`

- [x] **Step 1: Write LibraryFeatureTest.kt (failing tests first)**

```kotlin
// composeApp/src/commonTest/kotlin/com/trilium/syncpods/library/LibraryFeatureTest.kt
package com.trilium.syncpods.library

import app.cash.turbine.test
import com.trilium.syncpods.playlist.EpisodePayload
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.playlist.PlaylistEpisode
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import com.trilium.syncpods.profile.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LibraryFeatureTest {

    @Test
    fun `loads playlists and subscriptions on ScreenVisible`() = runTest {
        val playlists = listOf(testPlaylist("1"), testPlaylist("2"))
        val subs = listOf(SubscriptionSummary("https://feed.example.com", "My Pod", ""))
        val feature = LibraryFeature(
            backgroundScope,
            FakePlaylistRepository(playlists = playlists),
            FakeProfileRepository(subscriptions = subs),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals(2, latest.playlists.size)
            assertEquals(1, latest.subscriptions.size)
            assertFalse(latest.isLoading)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows loading state while data loads`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.ScreenVisible)
            val loading = awaitItem()
            assertTrue(loading.isLoading)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `opens create dialog on CreatePlaylistTapped`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.CreatePlaylistTapped)
            val state = awaitItem()
            assertTrue(state.showCreateDialog)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `updates create dialog name on CreateDialogNameChanged`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem() // initial
            feature.process(LibraryEvent.CreatePlaylistTapped)
            awaitItem() // dialog open
            feature.process(LibraryEvent.CreateDialogNameChanged("Road Trip"))
            val state = awaitItem()
            assertEquals("Road Trip", state.createDialogName)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `dismisses create dialog on CreateDialogDismissed`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.CreatePlaylistTapped)
            awaitItem() // dialog open
            feature.process(LibraryEvent.CreateDialogDismissed)
            val state = awaitItem()
            assertFalse(state.showCreateDialog)
            assertEquals("", state.createDialogName)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `adds playlist and closes dialog on CreateDialogConfirmed`() = runTest {
        val repo = FakePlaylistRepository()
        val feature = LibraryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.CreatePlaylistTapped)
            awaitItem()
            feature.process(LibraryEvent.CreateDialogNameChanged("New Playlist"))
            awaitItem()
            feature.process(LibraryEvent.CreateDialogConfirmed)
            var latest = awaitItem()
            while (latest.showCreateDialog) latest = awaitItem()

            assertFalse(latest.showCreateDialog)
            assertEquals(1, latest.playlists.size)
            assertEquals("New Playlist", latest.playlists[0].name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `removes playlist on PlaylistDeleted`() = runTest {
        val repo = FakePlaylistRepository(playlists = listOf(testPlaylist("p1"), testPlaylist("p2")))
        val feature = LibraryFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(LibraryEvent.PlaylistDeleted("p1"))
            latest = awaitItem()
            assertEquals(1, latest.playlists.size)
            assertEquals("p2", latest.playlists[0].id)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateToPlaylist on PlaylistTapped`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.effects.test {
            feature.process(LibraryEvent.PlaylistTapped("abc"))
            val effect = awaitItem()
            assertIs<LibraryEffect.NavigateToPlaylist>(effect)
            assertEquals("abc", (effect as LibraryEffect.NavigateToPlaylist).id)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateToPodcast on SubscriptionTapped`() = runTest {
        val feature = LibraryFeature(backgroundScope, FakePlaylistRepository(), FakeProfileRepository())

        feature.effects.test {
            feature.process(LibraryEvent.SubscriptionTapped("https://feed.example.com"))
            val effect = awaitItem()
            assertIs<LibraryEffect.NavigateToPodcast>(effect)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows login prompt for guest user`() = runTest {
        val feature = LibraryFeature(
            backgroundScope,
            FakePlaylistRepository(),
            FakeProfileRepository(guest = true),
        )

        feature.state.test {
            awaitItem()
            feature.process(LibraryEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            assertTrue(latest.showLoginPrompt)
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

internal class FakePlaylistRepository(
    private val playlists: List<Playlist> = emptyList(),
    private val shouldThrow: Boolean = false,
) : PlaylistRepository {
    private val mutablePlaylists = playlists.toMutableList()
    var createdName: String? = null

    override suspend fun getPlaylists(): List<Playlist> {
        if (shouldThrow) throw Exception("Network error")
        return mutablePlaylists.toList()
    }
    override suspend fun createPlaylist(name: String, description: String?): Playlist {
        createdName = name
        val p = testPlaylist(id = "new-${mutablePlaylists.size}", name = name)
        mutablePlaylists.add(p)
        return p
    }
    override suspend fun renamePlaylist(id: String, name: String) {}
    override suspend fun deletePlaylist(id: String) { mutablePlaylists.removeAll { it.id == id } }
    override suspend fun togglePublic(id: String, isPublic: Boolean) {}
    override suspend fun reorderPlaylists(orderedIds: List<String>) {}
    override suspend fun getPlaylistEpisodes(playlistId: String): List<PlaylistEpisode> = emptyList()
    override suspend fun addEpisode(playlistId: String, episode: EpisodePayload) {}
    override suspend fun removeEpisode(playlistId: String, guid: String) {}
    override suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>) {}
}

internal class FakeProfileRepository(
    private val tier: String = "free",
    private val subscriptions: List<SubscriptionSummary> = emptyList(),
    private val guest: Boolean = false,
) : ProfileRepository {
    override fun isGuest(): Boolean = guest
    override fun authStateChanges(): Flow<Unit> = emptyFlow()
    override suspend fun getUserTier(): String = tier
    override suspend fun getUserProfile() = UserProfile("", "", tier)
    override suspend fun getSubscriptions(): List<SubscriptionSummary> = subscriptions
}

internal fun testPlaylist(
    id: String = "playlist-1",
    name: String = "Test Playlist",
) = Playlist(id = id, name = name, description = null, isPublic = false, position = 0, episodeCount = 0, artworkUrls = emptyList())
```

- [x] **Step 2: Run tests — expect compile failure (LibraryFeature doesn't exist yet)**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.library.LibraryFeatureTest"
```

Expected: compilation error — `LibraryFeature`, `LibraryEvent`, `LibraryEffect` not found.

- [x] **Step 3: Create LibraryFeature.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/library/LibraryFeature.kt
package com.trilium.syncpods.library

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.profile.SubscriptionSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

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

// ── Events ────────────────────────────────────────────────────────────────────

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

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class LibraryAction {
    data object Load : LibraryAction()
    data object ShowCreateDialog : LibraryAction()
    data class UpdateCreateName(val name: String) : LibraryAction()
    data object CreatePlaylist : LibraryAction()
    data object DismissCreateDialog : LibraryAction()
    data class NavigateToPlaylist(val id: String) : LibraryAction()
    data class DeletePlaylist(val id: String) : LibraryAction()
    data class RenamePlaylist(val id: String, val name: String) : LibraryAction()
    data class ReorderPlaylists(val orderedIds: List<String>) : LibraryAction()
    data class NavigateToPodcast(val feedUrl: String) : LibraryAction()
    data object DismissLoginPrompt : LibraryAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class LibraryResult {
    data object Loading : LibraryResult()
    data class Loaded(
        val playlists: List<Playlist>,
        val subscriptions: List<SubscriptionSummary>,
        val tier: String,
        val isGuest: Boolean,
    ) : LibraryResult()
    data class LoadError(val message: String) : LibraryResult()
    data object ShowCreateDialog : LibraryResult()
    data object DismissCreateDialog : LibraryResult()
    data class UpdateCreateName(val name: String) : LibraryResult()
    data class PlaylistCreated(val playlist: Playlist) : LibraryResult()
    data class PlaylistDeleted(val id: String) : LibraryResult()
    data class PlaylistRenamed(val id: String, val name: String) : LibraryResult()
    data class PlaylistsReordered(val orderedIds: List<String>) : LibraryResult()
    data object LoginPromptDismissed : LibraryResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class LibraryEffect {
    data class NavigateToPlaylist(val id: String) : LibraryEffect()
    data class NavigateToPodcast(val feedUrl: String) : LibraryEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class LibraryFeature(
    scope: CoroutineScope,
    private val playlistRepository: PlaylistRepository,
    private val profileRepository: ProfileRepository,
) : StandardFeature<LibraryState, LibraryEvent, LibraryAction, LibraryResult, LibraryEffect>(scope) {

    private val _effects = MutableSharedFlow<LibraryEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<LibraryEffect> get() = _effects

    override val initial = LibraryState()

    override val eventToAction: Interactor<LibraryEvent, LibraryAction> = { events ->
        merge(
            events.filterIsInstance<LibraryEvent.ScreenVisible>().map { LibraryAction.Load },
            events.filterIsInstance<LibraryEvent.CreatePlaylistTapped>().map { LibraryAction.ShowCreateDialog },
            events.filterIsInstance<LibraryEvent.CreateDialogNameChanged>().map { LibraryAction.UpdateCreateName(it.name) },
            events.filterIsInstance<LibraryEvent.CreateDialogConfirmed>().map { LibraryAction.CreatePlaylist },
            events.filterIsInstance<LibraryEvent.CreateDialogDismissed>().map { LibraryAction.DismissCreateDialog },
            events.filterIsInstance<LibraryEvent.PlaylistTapped>().map { LibraryAction.NavigateToPlaylist(it.id) },
            events.filterIsInstance<LibraryEvent.PlaylistDeleted>().map { LibraryAction.DeletePlaylist(it.id) },
            events.filterIsInstance<LibraryEvent.PlaylistRenamed>().map { LibraryAction.RenamePlaylist(it.id, it.name) },
            events.filterIsInstance<LibraryEvent.PlaylistsReordered>().map { LibraryAction.ReorderPlaylists(it.orderedIds) },
            events.filterIsInstance<LibraryEvent.SubscriptionTapped>().map { LibraryAction.NavigateToPodcast(it.feedUrl) },
            events.filterIsInstance<LibraryEvent.LoginPromptDismissed>().map { LibraryAction.DismissLoginPrompt },
        )
    }

    override val actionToResult: Interactor<LibraryAction, LibraryResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                LibraryAction.Load -> flow {
                    emit(LibraryResult.Loading)
                    try {
                        val isGuest = profileRepository.isGuest()
                        val playlists = if (isGuest) emptyList() else playlistRepository.getPlaylists()
                        val subs = profileRepository.getSubscriptions()
                        val tier = profileRepository.getUserTier()
                        emit(LibraryResult.Loaded(playlists, subs, tier, isGuest))
                    } catch (e: Exception) {
                        emit(LibraryResult.LoadError(e.message ?: "Failed to load"))
                    }
                }
                LibraryAction.ShowCreateDialog -> flowOf(LibraryResult.ShowCreateDialog)
                is LibraryAction.UpdateCreateName -> flowOf(LibraryResult.UpdateCreateName(action.name))
                LibraryAction.DismissCreateDialog -> flowOf(LibraryResult.DismissCreateDialog)
                LibraryAction.CreatePlaylist -> flow {
                    val name = state.value.createDialogName.trim()
                    if (name.isBlank()) return@flow
                    try {
                        val playlist = playlistRepository.createPlaylist(name)
                        emit(LibraryResult.PlaylistCreated(playlist))
                    } catch (_: Exception) { }
                }
                is LibraryAction.DeletePlaylist -> flow {
                    try {
                        playlistRepository.deletePlaylist(action.id)
                        emit(LibraryResult.PlaylistDeleted(action.id))
                    } catch (_: Exception) { }
                }
                is LibraryAction.RenamePlaylist -> flow {
                    try {
                        playlistRepository.renamePlaylist(action.id, action.name)
                        emit(LibraryResult.PlaylistRenamed(action.id, action.name))
                    } catch (_: Exception) { }
                }
                is LibraryAction.ReorderPlaylists -> flow {
                    emit(LibraryResult.PlaylistsReordered(action.orderedIds))
                    try { playlistRepository.reorderPlaylists(action.orderedIds) } catch (_: Exception) { }
                }
                is LibraryAction.NavigateToPlaylist -> flow<LibraryResult> {
                    _effects.emit(LibraryEffect.NavigateToPlaylist(action.id))
                }
                is LibraryAction.NavigateToPodcast -> flow<LibraryResult> {
                    _effects.emit(LibraryEffect.NavigateToPodcast(action.feedUrl))
                }
                LibraryAction.DismissLoginPrompt -> flowOf(LibraryResult.LoginPromptDismissed)
            }
        }
    }

    override suspend fun handleResult(previous: LibraryState, result: LibraryResult): LibraryState = when (result) {
        LibraryResult.Loading -> previous.copy(isLoading = true, error = null)
        is LibraryResult.Loaded -> previous.copy(
            isLoading = false,
            playlists = result.playlists,
            subscriptions = result.subscriptions,
            tier = result.tier,
            showLoginPrompt = result.isGuest,
            error = null,
        )
        is LibraryResult.LoadError -> previous.copy(isLoading = false, error = result.message)
        LibraryResult.ShowCreateDialog -> previous.copy(showCreateDialog = true)
        LibraryResult.DismissCreateDialog -> previous.copy(showCreateDialog = false, createDialogName = "")
        is LibraryResult.UpdateCreateName -> previous.copy(createDialogName = result.name)
        is LibraryResult.PlaylistCreated -> previous.copy(
            playlists = previous.playlists + result.playlist,
            showCreateDialog = false,
            createDialogName = "",
        )
        is LibraryResult.PlaylistDeleted -> previous.copy(
            playlists = previous.playlists.filter { it.id != result.id }
        )
        is LibraryResult.PlaylistRenamed -> previous.copy(
            playlists = previous.playlists.map { if (it.id == result.id) it.copy(name = result.name) else it }
        )
        is LibraryResult.PlaylistsReordered -> {
            val order = result.orderedIds.withIndex().associate { (i, id) -> id to i }
            previous.copy(playlists = previous.playlists.sortedBy { order[it.id] ?: Int.MAX_VALUE })
        }
        LibraryResult.LoginPromptDismissed -> previous.copy(showLoginPrompt = false)
    }
}
```

- [x] **Step 4: Run tests — expect all to pass**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.library.LibraryFeatureTest"
```

Expected: BUILD SUCCESSFUL, all 9 tests pass.

- [x] **Step 5: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/library/LibraryFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/library/LibraryFeatureTest.kt
git commit -m "feat: add LibraryFeature with tests"
```

---

## Task 4: LibraryViewModel + LibraryScreen

**Files:**
- Create: `commonMain/.../library/LibraryViewModel.kt`
- Create: `commonMain/.../library/LibraryScreen.kt`

- [x] **Step 1: Create LibraryViewModel.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/library/LibraryViewModel.kt
package com.trilium.syncpods.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class LibraryViewModel(
    playlistRepository: PlaylistRepository,
    profileRepository: ProfileRepository,
) : ViewModel() {
    val feature = LibraryFeature(viewModelScope + Dispatchers.Default, playlistRepository, profileRepository)
}
```

- [x] **Step 2: Create LibraryScreen.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/library/LibraryScreen.kt
package com.trilium.syncpods.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trilium.syncpods.auth.LoginPromptSheet
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.profile.SubscriptionSummary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    feature: com.composure.arch.Feature<LibraryState, LibraryEvent, LibraryEffect>,
    modifier: Modifier = Modifier,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()

    if (state.showLoginPrompt) {
        LoginPromptSheet(onDismiss = { feature.process(LibraryEvent.LoginPromptDismissed) })
    }

    if (state.showCreateDialog) {
        AlertDialog(
            onDismissRequest = { feature.process(LibraryEvent.CreateDialogDismissed) },
            title = { Text("New Playlist") },
            text = {
                OutlinedTextField(
                    value = state.createDialogName,
                    onValueChange = { feature.process(LibraryEvent.CreateDialogNameChanged(it)) },
                    label = { Text("Name") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { feature.process(LibraryEvent.CreateDialogConfirmed) },
                    enabled = state.createDialogName.isNotBlank(),
                ) { Text("Create") }
            },
            dismissButton = {
                TextButton(onClick = { feature.process(LibraryEvent.CreateDialogDismissed) }) { Text("Cancel") }
            },
        )
    }

    Box(modifier = modifier.fillMaxSize()) {
        if (state.isLoading) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        } else {
            LazyColumn(
                contentPadding = PaddingValues(bottom = bottomContentPadding + 80.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                // Subscriptions strip
                if (state.subscriptions.isNotEmpty()) {
                    item {
                        Text(
                            text = "Subscribed Podcasts",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    item {
                        SubscriptionsRow(
                            subscriptions = state.subscriptions,
                            onTap = { feature.process(LibraryEvent.SubscriptionTapped(it)) },
                        )
                    }
                    item { Spacer(modifier = Modifier.height(16.dp)) }
                }

                // Playlists header
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Your Playlists",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        val atLimit = state.tier == "free" && state.playlists.size >= 3
                        IconButton(
                            onClick = { if (!atLimit) feature.process(LibraryEvent.CreatePlaylistTapped) },
                            enabled = !atLimit,
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "New playlist")
                        }
                    }
                }

                // Playlist rows
                items(state.playlists, key = { it.id }) { playlist ->
                    PlaylistRow(
                        playlist = playlist,
                        onClick = { feature.process(LibraryEvent.PlaylistTapped(playlist.id)) },
                        onDelete = { feature.process(LibraryEvent.PlaylistDeleted(playlist.id)) },
                    )
                }

                if (state.playlists.isEmpty() && !state.isLoading) {
                    item {
                        Text(
                            text = "No playlists yet. Tap + to create one.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SubscriptionsRow(
    subscriptions: List<SubscriptionSummary>,
    onTap: (feedUrl: String) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(subscriptions, key = { it.feedUrl }) { sub ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.width(64.dp).clickable { onTap(sub.feedUrl) },
            ) {
                AsyncImage(
                    model = sub.artworkUrl,
                    contentDescription = sub.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)),
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = sub.title,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun PlaylistRow(
    playlist: Playlist,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    ListItem(
        headlineContent = {
            Text(playlist.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        supportingContent = {
            Text(
                "${playlist.episodeCount} episode${if (playlist.episodeCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        leadingContent = { PlaylistCoverArt(artworkUrls = playlist.artworkUrls) },
        trailingContent = {
            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = androidx.compose.material.icons.Icons.Default.Delete,
                    contentDescription = "Delete playlist",
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        },
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@Composable
private fun PlaylistCoverArt(artworkUrls: List<String>) {
    Box(modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp))) {
        when (artworkUrls.size) {
            0 -> Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxSize()) { }
            1 -> AsyncImage(model = artworkUrls[0], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            else -> {
                // 2×2 collage
                androidx.compose.foundation.layout.Row(modifier = Modifier.fillMaxSize()) {
                    Column(modifier = Modifier.weight(1f)) {
                        AsyncImage(model = artworkUrls[0], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                        if (artworkUrls.size > 2)
                            AsyncImage(model = artworkUrls[2], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        AsyncImage(model = artworkUrls[1], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                        if (artworkUrls.size > 3)
                            AsyncImage(model = artworkUrls[3], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                    }
                }
            }
        }
    }
}
```

- [x] **Step 3: Add drag-to-reorder for playlists list**

The spec requires drag-to-reorder for the playlists list in LibraryScreen. `LibraryEvent.PlaylistsReordered` and the feature handler are already implemented. For the UI, follow the exact same drag-to-reorder approach used in `QueueScreen.kt` (look for the library it uses — likely `sh.calvin.reorderable` or `androidx.compose.foundation` drag helpers). Replace the `items(state.playlists)` block with the reorderable equivalent, emitting `LibraryEvent.PlaylistsReordered(newOrder)` on drop.

- [x] **Step 4: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/library/
git commit -m "feat: add LibraryViewModel and LibraryScreen"
```

---

## Task 5: PlaylistDetailFeature + Tests

**Files:**
- Create: `commonMain/.../playlistdetail/PlaylistDetailFeature.kt`
- Create: `commonTest/.../playlistdetail/PlaylistDetailFeatureTest.kt`

- [x] **Step 1: Write PlaylistDetailFeatureTest.kt (failing tests first)**

```kotlin
// composeApp/src/commonTest/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailFeatureTest.kt
package com.trilium.syncpods.playlistdetail

import app.cash.turbine.test
import com.trilium.syncpods.library.FakePlaylistRepository
import com.trilium.syncpods.library.FakeProfileRepository
import com.trilium.syncpods.library.testPlaylist
import com.trilium.syncpods.playlist.EpisodePayload
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.playlist.PlaylistEpisode
import com.trilium.syncpods.playlist.PlaylistRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class PlaylistDetailFeatureTest {

    @Test
    fun `loads playlist and episodes on ScreenVisible`() = runTest {
        val playlist = testPlaylist("p1", "Morning Mix")
        val episodes = listOf(testEpisode("e1"), testEpisode("e2"))
        val repo = FakePlaylistDetailRepository(playlist = playlist, episodes = episodes)
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            assertEquals("Morning Mix", latest.playlist?.name)
            assertEquals(2, latest.episodes.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateToPlayer on EpisodeTapped`() = runTest {
        val repo = FakePlaylistDetailRepository(episodes = listOf(testEpisode("e1")))
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        feature.effects.test {
            feature.process(PlaylistDetailEvent.EpisodeTapped(testEpisode("e1")))
            assertIs<PlaylistDetailEffect.NavigateToPlayer>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `removes episode from list`() = runTest {
        val episodes = listOf(testEpisode("e1"), testEpisode("e2"))
        val repo = FakePlaylistDetailRepository(episodes = episodes)
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(PlaylistDetailEvent.EpisodeRemoved("e1"))
            latest = awaitItem()
            assertEquals(1, latest.episodes.size)
            assertEquals("e2", latest.episodes[0].guid)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `reorders episodes optimistically`() = runTest {
        val episodes = listOf(testEpisode("e1"), testEpisode("e2"), testEpisode("e3"))
        val repo = FakePlaylistDetailRepository(episodes = episodes)
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()

            feature.process(PlaylistDetailEvent.EpisodesReordered(listOf("e3", "e1", "e2")))
            latest = awaitItem()
            assertEquals(listOf("e3", "e1", "e2"), latest.episodes.map { it.guid })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows rename dialog on RenameTapped`() = runTest {
        val feature = PlaylistDetailFeature(backgroundScope, FakePlaylistDetailRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.RenameTapped)
            val state = awaitItem()
            assertTrue(state.isRenaming)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `dismisses rename dialog on RenameDismissed`() = runTest {
        val feature = PlaylistDetailFeature(backgroundScope, FakePlaylistDetailRepository(), FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.RenameTapped)
            awaitItem()
            feature.process(PlaylistDetailEvent.RenameDismissed)
            val state = awaitItem()
            assertFalse(state.isRenaming)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateBack on BackTapped`() = runTest {
        val feature = PlaylistDetailFeature(backgroundScope, FakePlaylistDetailRepository(), FakeProfileRepository())

        feature.effects.test {
            feature.process(PlaylistDetailEvent.BackTapped)
            assertIs<PlaylistDetailEffect.NavigateBack>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits NavigateBack after playlist deleted`() = runTest {
        val repo = FakePlaylistDetailRepository(playlist = testPlaylist("p1"))
        val feature = PlaylistDetailFeature(backgroundScope, repo, FakeProfileRepository())

        feature.state.test {
            awaitItem()
            feature.process(PlaylistDetailEvent.ScreenVisible("p1"))
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        feature.effects.test {
            feature.process(PlaylistDetailEvent.DeletePlaylistTapped)
            assertIs<PlaylistDetailEffect.NavigateBack>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Fakes ─────────────────────────────────────────────────────────────────────

private class FakePlaylistDetailRepository(
    private val playlist: Playlist = testPlaylist("p1"),
    private val episodes: List<PlaylistEpisode> = emptyList(),
) : PlaylistRepository by FakePlaylistRepository() {
    override suspend fun getPlaylistEpisodes(playlistId: String) = episodes
    override suspend fun getPlaylists() = listOf(playlist)
    override suspend fun deletePlaylist(id: String) {}
    override suspend fun removeEpisode(playlistId: String, guid: String) {}
    override suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>) {}
    override suspend fun renamePlaylist(id: String, name: String) {}
    override suspend fun togglePublic(id: String, isPublic: Boolean) {}
}

private fun testEpisode(guid: String) = PlaylistEpisode(
    id = guid,
    guid = guid,
    feedUrl = "https://feed.example.com",
    position = 0,
    title = "Episode $guid",
    podcastTitle = "My Podcast",
    artworkUrl = null,
    audioUrl = "https://audio.example.com/ep.mp3",
    durationSeconds = 3600,
    positionSeconds = null,
    positionPct = null,
    completed = false,
)
```

- [x] **Step 2: Run tests — expect compile failure**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.playlistdetail.PlaylistDetailFeatureTest"
```

Expected: compilation error — `PlaylistDetailFeature`, `PlaylistDetailEvent`, `PlaylistDetailEffect` not found.

- [x] **Step 3: Create PlaylistDetailFeature.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailFeature.kt
package com.trilium.syncpods.playlistdetail

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.playlist.PlaylistEpisode
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class PlaylistDetailState(
    val isLoading: Boolean = false,
    val playlistId: String? = null,
    val playlist: Playlist? = null,
    val episodes: List<PlaylistEpisode> = emptyList(),
    val error: String? = null,
    val isRenaming: Boolean = false,
    val renameText: String = "",
    val tier: String = "free",
)

// ── Events ────────────────────────────────────────────────────────────────────

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

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class PlaylistDetailAction {
    data class Load(val playlistId: String) : PlaylistDetailAction()
    data class PlayEpisode(val episode: PlaylistEpisode) : PlaylistDetailAction()
    data class RemoveEpisode(val guid: String) : PlaylistDetailAction()
    data class ReorderEpisodes(val orderedGuids: List<String>) : PlaylistDetailAction()
    data object ShowRenameDialog : PlaylistDetailAction()
    data class UpdateRenameText(val name: String) : PlaylistDetailAction()
    data object ConfirmRename : PlaylistDetailAction()
    data object DismissRenameDialog : PlaylistDetailAction()
    data class TogglePublic(val isPublic: Boolean) : PlaylistDetailAction()
    data object DeletePlaylist : PlaylistDetailAction()
    data object NavigateBack : PlaylistDetailAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class PlaylistDetailResult {
    data object Loading : PlaylistDetailResult()
    data class Loaded(val playlist: Playlist, val episodes: List<PlaylistEpisode>, val tier: String) : PlaylistDetailResult()
    data class LoadError(val message: String) : PlaylistDetailResult()
    data class EpisodeRemoved(val guid: String) : PlaylistDetailResult()
    data class EpisodesReordered(val orderedGuids: List<String>) : PlaylistDetailResult()
    data object ShowRenameDialog : PlaylistDetailResult()
    data object DismissRenameDialog : PlaylistDetailResult()
    data class UpdateRenameText(val name: String) : PlaylistDetailResult()
    data class Renamed(val name: String) : PlaylistDetailResult()
    data class PublicToggled(val isPublic: Boolean) : PlaylistDetailResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class PlaylistDetailEffect {
    data object NavigateBack : PlaylistDetailEffect()
    data class NavigateToPlayer(val episode: PlaylistEpisode) : PlaylistDetailEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class PlaylistDetailFeature(
    scope: CoroutineScope,
    private val playlistRepository: PlaylistRepository,
    private val profileRepository: ProfileRepository,
) : StandardFeature<PlaylistDetailState, PlaylistDetailEvent, PlaylistDetailAction, PlaylistDetailResult, PlaylistDetailEffect>(scope) {

    private val _effects = MutableSharedFlow<PlaylistDetailEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<PlaylistDetailEffect> get() = _effects

    override val initial = PlaylistDetailState()

    override val eventToAction: Interactor<PlaylistDetailEvent, PlaylistDetailAction> = { events ->
        merge(
            events.filterIsInstance<PlaylistDetailEvent.ScreenVisible>().map { PlaylistDetailAction.Load(it.playlistId) },
            events.filterIsInstance<PlaylistDetailEvent.EpisodeTapped>().map { PlaylistDetailAction.PlayEpisode(it.episode) },
            events.filterIsInstance<PlaylistDetailEvent.EpisodeRemoved>().map { PlaylistDetailAction.RemoveEpisode(it.guid) },
            events.filterIsInstance<PlaylistDetailEvent.EpisodesReordered>().map { PlaylistDetailAction.ReorderEpisodes(it.orderedGuids) },
            events.filterIsInstance<PlaylistDetailEvent.RenameTapped>().map { PlaylistDetailAction.ShowRenameDialog },
            events.filterIsInstance<PlaylistDetailEvent.RenameTextChanged>().map { PlaylistDetailAction.UpdateRenameText(it.name) },
            events.filterIsInstance<PlaylistDetailEvent.RenameConfirmed>().map { PlaylistDetailAction.ConfirmRename },
            events.filterIsInstance<PlaylistDetailEvent.RenameDismissed>().map { PlaylistDetailAction.DismissRenameDialog },
            events.filterIsInstance<PlaylistDetailEvent.PublicPrivateToggled>().map { PlaylistDetailAction.TogglePublic(it.isPublic) },
            events.filterIsInstance<PlaylistDetailEvent.DeletePlaylistTapped>().map { PlaylistDetailAction.DeletePlaylist },
            events.filterIsInstance<PlaylistDetailEvent.BackTapped>().map { PlaylistDetailAction.NavigateBack },
        )
    }

    override val actionToResult: Interactor<PlaylistDetailAction, PlaylistDetailResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is PlaylistDetailAction.Load -> flow {
                    emit(PlaylistDetailResult.Loading)
                    try {
                        val playlists = playlistRepository.getPlaylists()
                        val playlist = playlists.find { it.id == action.playlistId }
                            ?: return@flow emit(PlaylistDetailResult.LoadError("Playlist not found"))
                        val episodes = playlistRepository.getPlaylistEpisodes(action.playlistId)
                        val tier = profileRepository.getUserTier()
                        emit(PlaylistDetailResult.Loaded(playlist, episodes, tier))
                    } catch (e: Exception) {
                        emit(PlaylistDetailResult.LoadError(e.message ?: "Failed to load"))
                    }
                }
                is PlaylistDetailAction.PlayEpisode -> flow<PlaylistDetailResult> {
                    _effects.emit(PlaylistDetailEffect.NavigateToPlayer(action.episode))
                }
                is PlaylistDetailAction.RemoveEpisode -> flow {
                    val playlistId = state.value.playlistId ?: return@flow
                    try {
                        playlistRepository.removeEpisode(playlistId, action.guid)
                        emit(PlaylistDetailResult.EpisodeRemoved(action.guid))
                    } catch (_: Exception) { }
                }
                is PlaylistDetailAction.ReorderEpisodes -> flow {
                    val playlistId = state.value.playlistId ?: return@flow
                    emit(PlaylistDetailResult.EpisodesReordered(action.orderedGuids))
                    try { playlistRepository.reorderEpisodes(playlistId, action.orderedGuids) } catch (_: Exception) { }
                }
                PlaylistDetailAction.ShowRenameDialog -> flowOf(PlaylistDetailResult.ShowRenameDialog)
                is PlaylistDetailAction.UpdateRenameText -> flowOf(PlaylistDetailResult.UpdateRenameText(action.name))
                PlaylistDetailAction.DismissRenameDialog -> flowOf(PlaylistDetailResult.DismissRenameDialog)
                PlaylistDetailAction.ConfirmRename -> flow {
                    val playlistId = state.value.playlistId ?: return@flow
                    val name = state.value.renameText.trim()
                    if (name.isBlank()) return@flow
                    try {
                        playlistRepository.renamePlaylist(playlistId, name)
                        emit(PlaylistDetailResult.Renamed(name))
                    } catch (_: Exception) { }
                }
                is PlaylistDetailAction.TogglePublic -> flow {
                    val playlistId = state.value.playlistId ?: return@flow
                    try {
                        playlistRepository.togglePublic(playlistId, action.isPublic)
                        emit(PlaylistDetailResult.PublicToggled(action.isPublic))
                    } catch (_: Exception) { }
                }
                PlaylistDetailAction.DeletePlaylist -> flow<PlaylistDetailResult> {
                    val playlistId = state.value.playlistId ?: return@flow
                    try {
                        playlistRepository.deletePlaylist(playlistId)
                        _effects.emit(PlaylistDetailEffect.NavigateBack)
                    } catch (_: Exception) { }
                }
                PlaylistDetailAction.NavigateBack -> flow<PlaylistDetailResult> {
                    _effects.emit(PlaylistDetailEffect.NavigateBack)
                }
            }
        }
    }

    override suspend fun handleResult(previous: PlaylistDetailState, result: PlaylistDetailResult): PlaylistDetailState = when (result) {
        PlaylistDetailResult.Loading -> previous.copy(isLoading = true, error = null)
        is PlaylistDetailResult.Loaded -> previous.copy(
            isLoading = false, playlist = result.playlist, playlistId = result.playlist.id,
            episodes = result.episodes, tier = result.tier, error = null,
        )
        is PlaylistDetailResult.LoadError -> previous.copy(isLoading = false, error = result.message)
        is PlaylistDetailResult.EpisodeRemoved -> previous.copy(
            episodes = previous.episodes.filter { it.guid != result.guid }
        )
        is PlaylistDetailResult.EpisodesReordered -> {
            val order = result.orderedGuids.withIndex().associate { (i, g) -> g to i }
            previous.copy(episodes = previous.episodes.sortedBy { order[it.guid] ?: Int.MAX_VALUE })
        }
        PlaylistDetailResult.ShowRenameDialog -> previous.copy(isRenaming = true, renameText = previous.playlist?.name ?: "")
        PlaylistDetailResult.DismissRenameDialog -> previous.copy(isRenaming = false, renameText = "")
        is PlaylistDetailResult.UpdateRenameText -> previous.copy(renameText = result.name)
        is PlaylistDetailResult.Renamed -> previous.copy(
            isRenaming = false, renameText = "",
            playlist = previous.playlist?.copy(name = result.name),
        )
        is PlaylistDetailResult.PublicToggled -> previous.copy(
            playlist = previous.playlist?.copy(isPublic = result.isPublic)
        )
    }
}
```

- [x] **Step 4: Run tests — expect all to pass**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.playlistdetail.PlaylistDetailFeatureTest"
```

Expected: BUILD SUCCESSFUL, all 8 tests pass.

- [x] **Step 5: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailFeatureTest.kt
git commit -m "feat: add PlaylistDetailFeature with tests"
```

---

## Task 6: PlaylistDetailViewModel + PlaylistDetailScreen

**Files:**
- Create: `commonMain/.../playlistdetail/PlaylistDetailViewModel.kt`
- Create: `commonMain/.../playlistdetail/PlaylistDetailScreen.kt`

- [x] **Step 1: Create PlaylistDetailViewModel.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailViewModel.kt
package com.trilium.syncpods.playlistdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class PlaylistDetailViewModel(
    playlistRepository: PlaylistRepository,
    profileRepository: ProfileRepository,
) : ViewModel() {
    val feature = PlaylistDetailFeature(viewModelScope + Dispatchers.Default, playlistRepository, profileRepository)
}
```

- [x] **Step 2: Create PlaylistDetailScreen.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailScreen.kt
package com.trilium.syncpods.playlistdetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.trilium.syncpods.playlist.PlaylistEpisode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    feature: com.composure.arch.Feature<PlaylistDetailState, PlaylistDetailEvent, PlaylistDetailEffect>,
    onPlayEpisode: (PlaylistEpisode) -> Unit,
    onBack: () -> Unit,
    topContentPadding: Dp = 0.dp,
    bottomContentPadding: Dp = 0.dp,
) {
    val state by feature.state.collectAsState()

    LaunchedEffect(feature.effects) {
        feature.effects.collect { effect ->
            when (effect) {
                PlaylistDetailEffect.NavigateBack -> onBack()
                is PlaylistDetailEffect.NavigateToPlayer -> onPlayEpisode(effect.episode)
            }
        }
    }

    if (state.isRenaming) {
        AlertDialog(
            onDismissRequest = { feature.process(PlaylistDetailEvent.RenameDismissed) },
            title = { Text("Rename Playlist") },
            text = {
                OutlinedTextField(
                    value = state.renameText,
                    onValueChange = { feature.process(PlaylistDetailEvent.RenameTextChanged(it)) },
                    label = { Text("Name") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { feature.process(PlaylistDetailEvent.RenameConfirmed) },
                    enabled = state.renameText.isNotBlank(),
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { feature.process(PlaylistDetailEvent.RenameDismissed) }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.playlist?.name ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = { feature.process(PlaylistDetailEvent.BackTapped) }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // Public/private toggle
                    state.playlist?.let { playlist ->
                        IconButton(onClick = { feature.process(PlaylistDetailEvent.PublicPrivateToggled(!playlist.isPublic)) }) {
                            Icon(
                                if (playlist.isPublic) Icons.Default.LockOpen else Icons.Default.Lock,
                                contentDescription = if (playlist.isPublic) "Make private" else "Make public",
                            )
                        }
                    }
                    // Rename
                    TextButton(onClick = { feature.process(PlaylistDetailEvent.RenameTapped) }) { Text("Rename") }
                    // Delete
                    IconButton(onClick = { feature.process(PlaylistDetailEvent.DeletePlaylistTapped) }) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete playlist", tint = MaterialTheme.colorScheme.error)
                    }
                },
                modifier = Modifier.padding(top = topContentPadding),
            )
        },
    ) { innerPadding ->
        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(bottom = bottomContentPadding + 80.dp),
                modifier = Modifier.fillMaxSize().padding(innerPadding),
            ) {
                // Header: collage + episode count
                item {
                    PlaylistDetailHeader(state = state)
                }

                // Episode list
                items(state.episodes, key = { it.id }) { episode ->
                    EpisodeRow(
                        episode = episode,
                        onTap = { feature.process(PlaylistDetailEvent.EpisodeTapped(episode)) },
                        onRemove = { feature.process(PlaylistDetailEvent.EpisodeRemoved(episode.guid)) },
                    )
                }

                if (state.episodes.isEmpty() && !state.isLoading) {
                    item {
                        Text(
                            text = "No episodes yet. Add some from Discover or History.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistDetailHeader(state: PlaylistDetailState) {
    val playlist = state.playlist ?: return
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Collage cover art (reuse logic from LibraryScreen)
        Box(modifier = Modifier.size(80.dp).clip(RoundedCornerShape(12.dp))) {
            when (playlist.artworkUrls.size) {
                0 -> Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxSize()) { }
                1 -> AsyncImage(model = playlist.artworkUrls[0], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                else -> {
                    Row(modifier = Modifier.fillMaxSize()) {
                        Column(modifier = Modifier.weight(1f)) {
                            AsyncImage(model = playlist.artworkUrls[0], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                            if (playlist.artworkUrls.size > 2)
                                AsyncImage(model = playlist.artworkUrls[2], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            AsyncImage(model = playlist.artworkUrls[1], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                            if (playlist.artworkUrls.size > 3)
                                AsyncImage(model = playlist.artworkUrls[3], contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxWidth())
                        }
                    }
                }
            }
        }
        Column {
            Text(text = playlist.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                text = "${playlist.episodeCount} episode${if (playlist.episodeCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SuggestionChip(
                onClick = { },
                label = { Text(if (playlist.isPublic) "Public" else "Private", style = MaterialTheme.typography.labelSmall) },
                modifier = Modifier.height(24.dp),
            )
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: PlaylistEpisode,
    onTap: () -> Unit,
    onRemove: () -> Unit,
) {
    ListItem(
        headlineContent = {
            Text(episode.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        supportingContent = {
            Text(
                text = buildString {
                    append(episode.podcastTitle)
                    episode.durationSeconds?.let { append(" · ${it / 3600}h ${(it % 3600) / 60}m") }
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        leadingContent = {
            AsyncImage(
                model = episode.artworkUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(48.dp).clip(RoundedCornerShape(6.dp)),
            )
        },
        trailingContent = {
            IconButton(onClick = onRemove) {
                Icon(Icons.Default.Delete, contentDescription = "Remove from playlist", tint = MaterialTheme.colorScheme.error)
            }
        },
        modifier = Modifier.clickable(onClick = onTap),
    )
}
```

- [x] **Step 3: Add drag-to-reorder for episode list**

The spec requires drag-to-reorder for the episode list in PlaylistDetailScreen. `PlaylistDetailEvent.EpisodesReordered` and the feature handler are already implemented. Follow the exact same drag-to-reorder approach from `QueueScreen.kt`. Replace the `items(state.episodes)` block with the reorderable equivalent, emitting `PlaylistDetailEvent.EpisodesReordered(newOrder)` on drop.

- [x] **Step 4: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/
git commit -m "feat: add PlaylistDetailViewModel and PlaylistDetailScreen"
```

---

## Task 7: AddToPlaylistViewModel + AddToPlaylistSheet

**Files:**
- Create: `commonMain/.../addtoplaylist/AddToPlaylistViewModel.kt`
- Create: `commonMain/.../addtoplaylist/AddToPlaylistSheet.kt`

- [x] **Step 1: Create AddToPlaylistViewModel.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/addtoplaylist/AddToPlaylistViewModel.kt
package com.trilium.syncpods.addtoplaylist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.playlist.EpisodePayload
import com.trilium.syncpods.playlist.Playlist
import com.trilium.syncpods.playlist.PlaylistRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AddToPlaylistState(
    val playlists: List<Playlist> = emptyList(),
    val isLoading: Boolean = false,
    val addingToPlaylistId: String? = null,
    val error: String? = null,
)

class AddToPlaylistViewModel(
    private val playlistRepository: PlaylistRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AddToPlaylistState())
    val state: StateFlow<AddToPlaylistState> = _state.asStateFlow()

    fun sheetOpened() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                val playlists = playlistRepository.getPlaylists()
                _state.update { it.copy(playlists = playlists, isLoading = false) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun addToPlaylist(playlistId: String, episode: EpisodePayload, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(addingToPlaylistId = playlistId) }
            try {
                playlistRepository.addEpisode(playlistId, episode)
                _state.update { it.copy(addingToPlaylistId = null) }
                onSuccess()
            } catch (e: Exception) {
                _state.update { it.copy(addingToPlaylistId = null, error = e.message) }
            }
        }
    }
}
```

- [x] **Step 2: Create AddToPlaylistSheet.kt**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/addtoplaylist/AddToPlaylistSheet.kt
package com.trilium.syncpods.addtoplaylist

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.trilium.syncpods.playlist.EpisodePayload
import com.trilium.syncpods.playlist.Playlist

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlaylistSheet(
    episode: EpisodePayload,
    viewModel: AddToPlaylistViewModel,
    onDismiss: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) { viewModel.sheetOpened() }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 32.dp)) {
            Text(
                text = "Add to Playlist",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            )
            HorizontalDivider()

            when {
                state.isLoading -> Box(modifier = Modifier.fillMaxWidth().height(120.dp)) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                state.playlists.isEmpty() -> Text(
                    text = "No playlists yet. Create one in the Library tab.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
                else -> LazyColumn {
                    items(state.playlists, key = { it.id }) { playlist ->
                        PlaylistSheetRow(
                            playlist = playlist,
                            isAdding = state.addingToPlaylistId == playlist.id,
                            onClick = {
                                viewModel.addToPlaylist(playlist.id, episode, onSuccess = onDismiss)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistSheetRow(
    playlist: Playlist,
    isAdding: Boolean,
    onClick: () -> Unit,
) {
    ListItem(
        headlineContent = {
            Text(playlist.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        supportingContent = {
            Text(
                "${playlist.episodeCount} episode${if (playlist.episodeCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingContent = {
            if (isAdding) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            }
        },
        modifier = Modifier.clickable(enabled = !isAdding, onClick = onClick),
    )
}
```

- [x] **Step 3: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/addtoplaylist/
git commit -m "feat: add AddToPlaylistViewModel and AddToPlaylistSheet"
```

---

## Task 8: AppRoutes + AppShell + AppModule Wiring

**Files:**
- Modify: `commonMain/.../navigation/AppRoutes.kt`
- Modify: `commonMain/.../shell/AppShell.kt`
- Modify: `commonMain/.../di/AppModule.kt`

- [x] **Step 1: Add PlaylistDetail route to AppRoutes.kt**

In `AppRoutes.kt`, add after the `Library` object:

```kotlin
data class PlaylistDetail(val id: String) : AppRoutes("playlist/{id}") {
    companion object {
        const val ROUTE = "playlist/{id}"
    }
}
```

Also add `PlaylistDetail.ROUTE` to the `isFullScreenRoute` check in `AppShell.kt` in the next step.

- [x] **Step 2: Update AppShell.kt — imports**

Add these imports to `AppShell.kt`:

```kotlin
import com.trilium.syncpods.library.LibraryEvent
import com.trilium.syncpods.library.LibraryEffect
import com.trilium.syncpods.library.LibraryScreen
import com.trilium.syncpods.library.LibraryViewModel
import com.trilium.syncpods.playlistdetail.PlaylistDetailEvent
import com.trilium.syncpods.playlistdetail.PlaylistDetailScreen
import com.trilium.syncpods.playlistdetail.PlaylistDetailViewModel
import com.trilium.syncpods.player.PlayerEvent
```

- [x] **Step 3: Update isFullScreenRoute in AppShell.kt**

Add `PlaylistDetail` to the full-screen route check (no bottom nav on this screen):

```kotlin
val isFullScreenRoute = currentDestination?.route == AppRoutes.Search.ROUTE
    || currentDestination?.route == AppRoutes.PodcastDetail.ROUTE
    || currentDestination?.route == AppRoutes.PlaylistDetail.ROUTE   // ← add this
    || currentDestination?.route == AppRoutes.Settings.route
    || currentDestination?.route == AppRoutes.Login.route
    || currentDestination?.route == AppRoutes.SignUp.route
    || currentDestination?.route == AppRoutes.ForgotPassword.route
    || currentDestination?.route == AppRoutes.VerifyEmail.ROUTE
```

- [x] **Step 4: Replace Library stub composable in AppShell.kt**

Find and replace the current Library composable stub:

```kotlin
// REMOVE:
composable(AppRoutes.Library.route) {
    Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
        Text("Library — coming soon")
    }
}

// REPLACE WITH:
composable(AppRoutes.Library.route) {
    val viewModel = koinViewModel<LibraryViewModel>()
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            viewModel.feature.process(LibraryEvent.ScreenVisible)
        }
    }
    LaunchedEffect(viewModel.feature.effects) {
        viewModel.feature.effects.collect { effect ->
            when (effect) {
                is LibraryEffect.NavigateToPlaylist ->
                    navController.navigate("playlist/${effect.id}")
                is LibraryEffect.NavigateToPodcast ->
                    navController.navigate("podcast/${effect.feedUrl.encodeURLPathPart()}")
            }
        }
    }
    LibraryScreen(
        feature = viewModel.feature,
        modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
        bottomContentPadding = innerPadding.calculateBottomPadding(),
    )
}
```

- [x] **Step 5: Add PlaylistDetail composable to AppShell.kt NavHost**

After the Library composable, add:

```kotlin
composable(AppRoutes.PlaylistDetail.ROUTE) { backStackEntry ->
    val playlistId = backStackEntry.arguments?.getString("id") ?: return@composable
    val viewModel = koinViewModel<PlaylistDetailViewModel>()
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            viewModel.feature.process(PlaylistDetailEvent.ScreenVisible(playlistId))
        }
    }
    PlaylistDetailScreen(
        feature = viewModel.feature,
        onPlayEpisode = { episode ->
            // Build a QueueItem from episode and delegate to the shared player
            onPlayEpisode(
                com.trilium.syncpods.queue.QueueItem(
                    guid = episode.guid,
                    feedUrl = episode.feedUrl,
                    position = episode.position,
                    title = episode.title,
                    podcastTitle = episode.podcastTitle,
                    artworkUrl = episode.artworkUrl,
                    audioUrl = episode.audioUrl,
                    durationSeconds = episode.durationSeconds,
                    positionSeconds = episode.positionSeconds,
                )
            )
        },
        onBack = { navController.popBackStack() },
        topContentPadding = innerPadding.calculateTopPadding(),
        bottomContentPadding = innerPadding.calculateBottomPadding(),
    )
}
```

- [x] **Step 6: Register new dependencies in AppModule.kt**

Add these registrations to `appModule` in `AppModule.kt`:

```kotlin
// Add these imports at the top of AppModule.kt:
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.playlist.SupabasePlaylistRepository
import com.trilium.syncpods.library.LibraryViewModel
import com.trilium.syncpods.playlistdetail.PlaylistDetailViewModel
import com.trilium.syncpods.addtoplaylist.AddToPlaylistViewModel

// Add these registrations inside the appModule { ... } block:
single<PlaylistRepository> { SupabasePlaylistRepository(supabaseClient = get()) }
viewModel { LibraryViewModel(get(), get()) }
viewModelOf(::PlaylistDetailViewModel)
viewModelOf(::AddToPlaylistViewModel)
```

- [x] **Step 7: Build to verify no compile errors**

```bash
./gradlew :composeApp:assembleDebug
```

Expected: BUILD SUCCESSFUL

- [x] **Step 8: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/navigation/AppRoutes.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt
git commit -m "feat: wire Library and PlaylistDetail into navigation and DI"
```

---

## Task 9: Add "Add to Playlist" to Episode Cards

**Files:**
- Modify: `commonMain/.../podcastdetail/PodcastDetailScreen.kt`
- Modify: `commonMain/.../queue/QueueScreen.kt`
- Modify: `commonMain/.../history/HistoryScreen.kt`

For each screen: add a state variable to track which episode has the sheet open, retrieve `AddToPlaylistViewModel` via `koinViewModel<AddToPlaylistViewModel>()`, show `AddToPlaylistSheet` when an episode is selected, and add an "Add to Playlist" icon button to episode rows.

### PodcastDetailScreen.kt

- [x] **Step 1: Add imports to PodcastDetailScreen.kt**

```kotlin
import com.trilium.syncpods.addtoplaylist.AddToPlaylistSheet
import com.trilium.syncpods.addtoplaylist.AddToPlaylistViewModel
import com.trilium.syncpods.playlist.EpisodePayload
import androidx.compose.material.icons.filled.PlaylistAdd
import org.koin.compose.viewmodel.koinViewModel
```

- [x] **Step 2: Add AddToPlaylistViewModel and sheet state to PodcastDetailScreen composable**

Inside `PodcastDetailScreen`, after the existing `val state by feature.state.collectAsState()`:

```kotlin
val addToPlaylistViewModel = koinViewModel<AddToPlaylistViewModel>()
var episodeForPlaylistSheet by remember { mutableStateOf<EpisodePayload?>(null) }

episodeForPlaylistSheet?.let { payload ->
    AddToPlaylistSheet(
        episode = payload,
        viewModel = addToPlaylistViewModel,
        onDismiss = { episodeForPlaylistSheet = null },
    )
}
```

- [x] **Step 3: Add "Add to Playlist" icon to episode rows in PodcastDetailScreen**

Find where episode action buttons are rendered (look for `PlaylistAdd`/`PlaylistRemove` icons — already present for queue). Add another `IconButton` next to them:

```kotlin
IconButton(onClick = {
    episodeForPlaylistSheet = EpisodePayload(
        guid = episode.guid,
        feedUrl = episode.feedUrl,
        title = episode.title,
        podcastTitle = state.podcastTitle,
        artworkUrl = episode.artworkUrl ?: state.artworkUrl,
        audioUrl = episode.audioUrl,
        durationSeconds = episode.durationSeconds,
    )
}) {
    Icon(
        imageVector = Icons.Default.PlaylistAdd,
        contentDescription = "Add to playlist",
    )
}
```

### QueueScreen.kt

- [x] **Step 4: Add AddToPlaylist support to QueueScreen**

Add the same pattern — import `AddToPlaylistSheet`, `AddToPlaylistViewModel`, `EpisodePayload`; add `val addToPlaylistViewModel = koinViewModel<AddToPlaylistViewModel>()`; add `var episodeForPlaylistSheet by remember { mutableStateOf<EpisodePayload?>(null) }` and the sheet composable.

Add an icon button on each `QueueItem` row that sets `episodeForPlaylistSheet`:

```kotlin
IconButton(onClick = {
    episodeForPlaylistSheet = EpisodePayload(
        guid = item.guid,
        feedUrl = item.feedUrl,
        title = item.title,
        podcastTitle = item.podcastTitle,
        artworkUrl = item.artworkUrl,
        audioUrl = item.audioUrl,
        durationSeconds = item.durationSeconds,
    )
}) {
    Icon(Icons.Default.PlaylistAdd, contentDescription = "Add to playlist")
}
```

### HistoryScreen.kt

- [x] **Step 5: Add AddToPlaylist support to HistoryScreen**

Same pattern as QueueScreen. Map `HistoryItem` to `EpisodePayload`:

```kotlin
episodeForPlaylistSheet = EpisodePayload(
    guid = item.guid,
    feedUrl = item.feedUrl,
    title = item.title,
    podcastTitle = item.podcastTitle,
    artworkUrl = item.artworkUrl,
    audioUrl = item.audioUrl,
    durationSeconds = item.durationSeconds,
)
```

- [x] **Step 6: Build to verify no compile errors**

```bash
./gradlew :composeApp:assembleDebug
```

Expected: BUILD SUCCESSFUL

- [x] **Step 7: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/podcastdetail/PodcastDetailScreen.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/queue/QueueScreen.kt \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/history/HistoryScreen.kt
git commit -m "feat: add Add to Playlist action to PodcastDetail, Queue, and History episode cards"
```

---

## Task 10: Wire Profile Stub + Run All Tests + Docs

**Files:**
- Modify: `commonMain/.../profile/ProfileFeature.kt`
- Modify: `docs/superpowers/specs/2026-04-30-playlist-design.md` (mark complete)

- [x] **Step 1: Wire ProfileAction.NavigateToViewAll in ProfileFeature.kt**

Find `ProfileAction.NavigateToViewAll` in `ProfileFeature.kt` (currently a stub). Emit a `ProfileEffect` that navigates to the Library tab. First check if a `NavigateToLibrary` effect already exists; if not, add it.

In `ProfileFeature.kt`, find the stub action handler:
```kotlin
is ProfileAction.NavigateToViewAll -> flow<ProfileResult> {
    // stub — Library screen not yet implemented
}
```

Replace with:
```kotlin
is ProfileAction.NavigateToViewAll -> flow<ProfileResult> {
    _effects.emit(ProfileEffect.NavigateToLibrary)
}
```

Add `NavigateToLibrary` to `ProfileEffect` if not present:
```kotlin
data object NavigateToLibrary : ProfileEffect()
```

- [x] **Step 2: Handle NavigateToLibrary effect in AppShell.kt ProfileScreen section**

In `AppShell.kt`, in the Profile composable's effect collection (add a `LaunchedEffect` for profile effects if one doesn't exist):

```kotlin
LaunchedEffect(viewModel.feature.effects) {
    viewModel.feature.effects.collect { effect ->
        when (effect) {
            is ProfileEffect.NavigateToPodcast -> navController.navigate("podcast/${effect.feedUrl.encodeURLPathPart()}")
            ProfileEffect.NavigateToLibrary -> navController.navigate(AppRoutes.Library.route) {
                launchSingleTop = true
                restoreState = true
            }
        }
    }
}
```

- [x] **Step 3: Run all tests**

```bash
./gradlew :composeApp:testDebugUnitTest
```

Expected: BUILD SUCCESSFUL, all tests pass (LibraryFeatureTest + PlaylistDetailFeatureTest + all pre-existing tests).

- [x] **Step 4: Do a final build**

```bash
./gradlew :composeApp:assembleDebug
```

Expected: BUILD SUCCESSFUL

- [x] **Step 5: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt
git commit -m "feat: wire Profile View All Subscriptions to Library tab"
```

- [x] **Step 6: Update CLAUDE.md with new Library tab section**

In `mobile/CLAUDE.md`, in the Package Structure section, replace the Library entry:

```
├── library/                 (Library tab: playlists + subscriptions)
├── playlistdetail/          (single playlist detail + episode list)
├── addtoplaylist/           (shared AddToPlaylistViewModel + AddToPlaylistSheet)
├── playlist/                (PlaylistModels, PlaylistRepository)
```

- [x] **Step 7: Final commit**

```bash
git add mobile/CLAUDE.md
git commit -m "docs: update CLAUDE.md with Library/Playlist package structure"
```

---

## Verification Checklist

1. Library tab loads — playlists and subscriptions appear; "Library — coming soon" stub is gone
2. Create playlist — dialog appears, name required, playlist appears in list; free-tier user blocked at 3
3. Rename playlist — works from PlaylistDetail header rename button
4. Delete playlist — removes from Library list; deleting from PlaylistDetail navigates back
5. Playlist detail — episodes load, public/private toggle chip updates
6. Drag-to-reorder — drag handle reorders episodes (verify in QueueScreen pattern is matched)
7. Add to Playlist sheet — appears from PodcastDetail, Queue, History episode cards; episode appears in chosen playlist
8. Subscription tap — navigates to PodcastDetail for that feed
9. Profile "View All Subscriptions" — navigates to Library tab
10. Guest user — Library shows login prompt instead of playlists
