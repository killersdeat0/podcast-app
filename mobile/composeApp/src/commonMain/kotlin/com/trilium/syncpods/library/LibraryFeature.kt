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

    companion object {
        const val FREE_PLAYLIST_LIMIT = 3
    }

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
                    if (state.value.tier == "free" && state.value.playlists.size >= FREE_PLAYLIST_LIMIT) return@flow
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
    }
}
