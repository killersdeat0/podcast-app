package com.trilium.syncpods.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.podcastdetail.PodcastSummaryCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class DiscoverViewModel(repository: PodcastRepository, cache: PodcastSummaryCache) : ViewModel() {
    val feature = DiscoverFeature(viewModelScope + Dispatchers.Default, repository, cache)
}
