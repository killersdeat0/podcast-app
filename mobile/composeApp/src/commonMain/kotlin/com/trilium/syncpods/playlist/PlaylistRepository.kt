package com.trilium.syncpods.playlist

// ── Interface ─────────────────────────────────────────────────────────────────

interface PlaylistRepository {
    suspend fun getPlaylists(): List<Playlist>
    suspend fun createPlaylist(name: String, description: String? = null): Playlist
    suspend fun renamePlaylist(id: String, name: String)
    suspend fun deletePlaylist(id: String)
    suspend fun togglePublic(id: String, isPublic: Boolean)
    suspend fun reorderPlaylists(orderedIds: List<String>)
    suspend fun getPlaylistEpisodes(playlistId: String): List<PlaylistEpisode>
    suspend fun addEpisode(playlistId: String, episode: EpisodePayload)
    suspend fun removeEpisode(playlistId: String, guid: String)
    suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>)
}
