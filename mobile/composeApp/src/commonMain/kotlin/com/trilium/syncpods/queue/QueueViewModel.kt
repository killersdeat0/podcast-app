package com.trilium.syncpods.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class QueueViewModel(repository: QueueRepository, profileRepository: ProfileRepository) : ViewModel() {
    val feature = QueueFeature(viewModelScope + Dispatchers.Default, repository, profileRepository)
}
