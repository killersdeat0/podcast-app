package com.trilium.syncpods.podcastdetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.queue.QueueRepository
import io.ktor.http.decodeURLPart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class PodcastDetailViewModel(
    savedStateHandle: SavedStateHandle,
    feedRepository: EpisodeFeedRepository,
    subscriptionRepository: SubscriptionRepository,
    summaryCache: PodcastSummaryCache,
    queueRepository: QueueRepository,
) : ViewModel() {

    // feedUrl is URL-encoded in the route path — decode before use
    private val feedUrl = (savedStateHandle.get<String>("feedUrl") ?: "").decodeURLPart()

    val feature = PodcastDetailFeature(
        scope = viewModelScope + Dispatchers.Default,
        feedUrl = feedUrl,
        feedRepository = feedRepository,
        subscriptionRepository = subscriptionRepository,
        summaryCache = summaryCache,
        queueRepository = queueRepository,
    )
}
