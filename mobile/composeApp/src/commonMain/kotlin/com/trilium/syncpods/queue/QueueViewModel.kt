package com.trilium.syncpods.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.plus

class QueueViewModel(
    repository: QueueRepository,
    profileRepository: ProfileRepository,
    reloadTrigger: Flow<Unit> = emptyFlow(),
) : ViewModel() {
    val feature = QueueFeature(viewModelScope + Dispatchers.Default, repository, profileRepository, reloadTrigger)
}
