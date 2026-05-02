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
