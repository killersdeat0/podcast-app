package com.trilium.syncpods.playlistdetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.playlist.PlaylistRepository
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class PlaylistDetailViewModel(
    savedStateHandle: SavedStateHandle,
    playlistRepository: PlaylistRepository,
    profileRepository: ProfileRepository,
) : ViewModel() {
    val playlistId: String = savedStateHandle.get<String>("id") ?: ""
    val feature = PlaylistDetailFeature(viewModelScope + Dispatchers.Default, playlistRepository, profileRepository)
}
