package com.trilium.syncpods.search

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.discover.PodcastRepository
import com.trilium.syncpods.podcastdetail.PodcastSummaryCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class SearchViewModel(
    savedStateHandle: SavedStateHandle,
    repository: PodcastRepository,
    cache: PodcastSummaryCache,
) : ViewModel() {
    val feature = SearchFeature(
        scope = viewModelScope + Dispatchers.Default,
        repository = repository,
        cache = cache,
        initialQuery = savedStateHandle["query"] ?: "",
    )
}
