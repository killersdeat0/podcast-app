package com.trilium.syncpods.player

data class NowPlaying(
    val guid: String,
    val title: String,
    val podcastName: String,
    val artworkUrl: String,
    val audioUrl: String,
    val feedUrl: String,
    val durationSeconds: Int?,
)
