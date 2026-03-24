package com.trilium.syncpods.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class PlayerViewModel(audioPlayer: AudioPlayer) : ViewModel() {
    val feature = PlayerFeature(viewModelScope + Dispatchers.Default, audioPlayer)
}
