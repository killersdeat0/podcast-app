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
