package com.trilium.syncpods.discover

interface PodcastRepository {
    suspend fun searchPodcasts(query: String, genreId: Int? = null): List<PodcastSummary>
    suspend fun fetchTrending(genreId: Int? = null): List<PodcastSummary>
}
