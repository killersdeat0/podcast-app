package com.trilium.syncpods.podcastdetail

import kotlinx.serialization.Serializable

@Serializable
data class Episode(
    val guid: String,
    val title: String,
    val audioUrl: String,
    val duration: Int? = null,   // seconds; nullable — some RSS feeds omit duration
    val pubDate: String,
    val description: String,
    val chapterUrl: String? = null,
)

@Serializable
data class PodcastFeedResponse(
    val title: String,
    val description: String,
    val artworkUrl: String,
    val episodes: List<Episode>,
)
