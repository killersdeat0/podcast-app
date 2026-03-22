package com.trilium.syncpods.podcastdetail

import com.trilium.syncpods.discover.PodcastSummary

class PodcastSummaryCache {
    private val cache = mutableMapOf<String, PodcastSummary>()

    fun put(feedUrl: String, summary: PodcastSummary) {
        cache[feedUrl] = summary
    }

    fun get(feedUrl: String): PodcastSummary? = cache[feedUrl]
}
