package com.trilium.syncpods.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class DiscoverViewModel(repository: PodcastRepository) : ViewModel() {
    val feature = DiscoverFeature(viewModelScope + Dispatchers.Default, repository)
}
