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
