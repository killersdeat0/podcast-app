package com.trilium.syncpods.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class HistoryViewModel(
    repository: HistoryRepository,
    profileRepository: ProfileRepository,
) : ViewModel() {
    val feature = HistoryFeature(viewModelScope + Dispatchers.Default, repository, profileRepository)
}
