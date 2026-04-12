package com.trilium.syncpods.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class PlayerViewModel(
    audioPlayer: AudioPlayer,
    progressRepository: ProgressRepository,
    profileRepository: ProfileRepository,
) : ViewModel() {
    val feature = PlayerFeature(
        viewModelScope + Dispatchers.Default,
        audioPlayer,
        progressRepository,
        profileRepository,
    )
}
