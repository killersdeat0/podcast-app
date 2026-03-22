package com.trilium.syncpods.discover

import kotlinx.serialization.Serializable

@Serializable
data class PodcastSummary(
    val id: Long,
    val title: String,
    val artistName: String,
    val artworkUrl: String,
    val feedUrl: String,
    val genres: List<String>,
    val primaryGenre: String,
)

data class Genre(val id: Int, val label: String)

val PODCAST_GENRES = listOf(
    Genre(0, "All"),
    Genre(1303, "Comedy"),
    Genre(1318, "Technology"),
    Genre(1489, "News"),
    Genre(1488, "True Crime"),
    Genre(1321, "Business"),
    Genre(1304, "Education"),
    Genre(1324, "Society & Culture"),
    Genre(1545, "Sports"),
    Genre(1512, "Health & Fitness"),
)

@Serializable
internal data class ItunesResult(
    val trackId: Long = 0,
    val collectionName: String = "",
    val artistName: String = "",
    val artworkUrl600: String? = null,
    val artworkUrl100: String? = null,
    val feedUrl: String? = null,
    val genres: List<String> = emptyList(),
    val primaryGenreName: String = "",
)

@Serializable
internal data class ItunesSearchResponse(
    val results: List<ItunesResult> = emptyList(),
)

internal fun ItunesResult.toPodcastSummary(): PodcastSummary? {
    val url = feedUrl ?: return null
    if (collectionName.isBlank()) return null
    return PodcastSummary(
        id = trackId,
        title = collectionName,
        artistName = artistName,
        artworkUrl = artworkUrl600 ?: artworkUrl100 ?: "",
        feedUrl = url,
        genres = genres,
        primaryGenre = primaryGenreName,
    )
}
