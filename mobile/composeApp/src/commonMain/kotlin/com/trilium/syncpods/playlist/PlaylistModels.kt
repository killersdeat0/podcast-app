package com.trilium.syncpods.playlist

// ── Domain models ─────────────────────────────────────────────────────────────

data class Playlist(
    val id: String,
    val name: String,
    val description: String?,
    val isPublic: Boolean,
    val position: Int,
    val episodeCount: Int,
    val artworkUrls: List<String>, // up to 4, for 2×2 collage cover
)

data class PlaylistEpisode(
    val id: String, // playlist_episodes row id (join table); use guid for episode identity
    val guid: String,
    val feedUrl: String,
    val position: Int,
    val title: String,
    val podcastTitle: String,
    val artworkUrl: String?,
    val audioUrl: String,
    val durationSeconds: Int?,
    val positionSeconds: Int?,
    val positionPct: Float?,
    val completed: Boolean,
)

// ── Payload ───────────────────────────────────────────────────────────────────

// Payload for adding an episode to a playlist from any screen.
// Callers map their local episode model to this before calling addEpisode.
data class EpisodePayload(
    val guid: String,
    val feedUrl: String,
    val title: String,
    val podcastTitle: String,
    val artworkUrl: String?,
    val audioUrl: String,
    val durationSeconds: Int?,
    val pubDate: String? = null,
)
