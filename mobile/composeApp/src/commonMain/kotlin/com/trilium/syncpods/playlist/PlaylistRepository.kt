package com.trilium.syncpods.playlist

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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

// ── Row types ─────────────────────────────────────────────────────────────────

@Serializable
private data class PlaylistRow(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("is_public") val isPublic: Boolean = false,
    @SerialName("position") val position: Int = 0,
)

@Serializable
private data class PlaylistInsertRow(
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("is_public") val isPublic: Boolean = false,
    @SerialName("position") val position: Int,
    @SerialName("user_id") val userId: String,
)

@Serializable
private data class PlaylistEpisodeLinkRow(
    @SerialName("id") val id: String,
    @SerialName("playlist_id") val playlistId: String,
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position") val position: Int,
)

@Serializable
private data class PlaylistEpisodeInsertRow(
    @SerialName("playlist_id") val playlistId: String,
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position") val position: Int,
)

@Serializable
private data class EpisodeMetaRow(
    @SerialName("guid") val guid: String,
    @SerialName("title") val title: String? = null,
    @SerialName("audio_url") val audioUrl: String? = null,
    @SerialName("duration") val duration: Int? = null,
    @SerialName("artwork_url") val artworkUrl: String? = null,
    @SerialName("podcast_title") val podcastTitle: String? = null,
)

@Serializable
private data class EpisodeUpsertRow(
    @SerialName("guid") val guid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("title") val title: String,
    @SerialName("audio_url") val audioUrl: String,
    @SerialName("duration") val duration: Int?,
    @SerialName("pub_date") val pubDate: String?,
    @SerialName("podcast_title") val podcastTitle: String,
    @SerialName("artwork_url") val artworkUrl: String?,
)

@Serializable
private data class ProgressDetailRow(
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("position_seconds") val positionSeconds: Int,
    @SerialName("position_pct") val positionPct: Float? = null,
    @SerialName("completed") val completed: Boolean = false,
)

@Serializable
private data class PositionRow(@SerialName("position") val position: Int)

// ── Implementation ────────────────────────────────────────────────────────────

class SupabasePlaylistRepository(
    private val supabaseClient: SupabaseClient,
) : PlaylistRepository {

    override suspend fun getPlaylists(): List<Playlist> = coroutineScope {
        val playlistRows = supabaseClient.from("playlists")
            .select(Columns.list("id", "name", "description", "is_public", "position")) {
                order("position", order = Order.ASCENDING)
            }.decodeList<PlaylistRow>()

        if (playlistRows.isEmpty()) return@coroutineScope emptyList()
        val ids = playlistRows.map { it.id }

        val linkRows = supabaseClient.from("playlist_episodes")
            .select(Columns.list("id", "playlist_id", "episode_guid", "feed_url", "position")) {
                filter { isIn("playlist_id", ids) }
                order("position", order = Order.ASCENDING)
            }.decodeList<PlaylistEpisodeLinkRow>()

        val allGuids = linkRows.map { it.episodeGuid }.distinct()
        val artworkDeferred = async {
            if (allGuids.isNotEmpty()) {
                supabaseClient.from("episodes")
                    .select(Columns.list("guid", "artwork_url")) {
                        filter { isIn("guid", allGuids) }
                    }.decodeList<EpisodeMetaRow>().associate { it.guid to it.artworkUrl }
            } else emptyMap()
        }
        val artworkMap = artworkDeferred.await()

        val linksByPlaylist = linkRows.groupBy { it.playlistId }

        playlistRows.map { row ->
            val links = linksByPlaylist[row.id] ?: emptyList()
            val artworkUrls = links.take(4).mapNotNull { artworkMap[it.episodeGuid] }
            Playlist(
                id = row.id,
                name = row.name,
                description = row.description,
                isPublic = row.isPublic,
                position = row.position,
                episodeCount = links.size,
                artworkUrls = artworkUrls,
            )
        }
    }

    override suspend fun createPlaylist(name: String, description: String?): Playlist {
        val userId = supabaseClient.auth.currentUserOrNull()?.id ?: throw Exception("Not authenticated")
        val positions = supabaseClient.from("playlists")
            .select(Columns.list("position")) { filter { eq("user_id", userId) } }
            .decodeList<PositionRow>()
        val nextPosition = (positions.maxOfOrNull { it.position } ?: -1) + 1
        val row = supabaseClient.from("playlists").insert(
            PlaylistInsertRow(name = name, description = description, isPublic = false, position = nextPosition, userId = userId)
        ) { select() }.decodeSingle<PlaylistRow>()
        return Playlist(id = row.id, name = row.name, description = row.description, isPublic = row.isPublic, position = row.position, episodeCount = 0, artworkUrls = emptyList())
    }

    override suspend fun renamePlaylist(id: String, name: String) {
        supabaseClient.from("playlists").update({ set("name", name) }) {
            filter { eq("id", id) }
        }
    }

    override suspend fun deletePlaylist(id: String) {
        supabaseClient.from("playlists").delete { filter { eq("id", id) } }
    }

    override suspend fun togglePublic(id: String, isPublic: Boolean) {
        supabaseClient.from("playlists").update({ set("is_public", isPublic) }) {
            filter { eq("id", id) }
        }
    }

    override suspend fun reorderPlaylists(orderedIds: List<String>) {
        coroutineScope {
            orderedIds.mapIndexed { index, id ->
                async {
                    supabaseClient.from("playlists").update({ set("position", index) }) {
                        filter { eq("id", id) }
                    }
                }
            }.awaitAll()
        }
    }

    override suspend fun getPlaylistEpisodes(playlistId: String): List<PlaylistEpisode> = coroutineScope {
        val linkRows = supabaseClient.from("playlist_episodes")
            .select(Columns.list("id", "playlist_id", "episode_guid", "feed_url", "position")) {
                filter { eq("playlist_id", playlistId) }
                order("position", order = Order.ASCENDING)
            }.decodeList<PlaylistEpisodeLinkRow>()

        if (linkRows.isEmpty()) return@coroutineScope emptyList()
        val guids = linkRows.map { it.episodeGuid }

        val episodesDeferred = async {
            supabaseClient.from("episodes")
                .select(Columns.list("guid", "title", "audio_url", "duration", "artwork_url", "podcast_title")) {
                    filter { isIn("guid", guids) }
                }.decodeList<EpisodeMetaRow>().associateBy { it.guid }
        }
        val progressDeferred = async {
            supabaseClient.from("playback_progress")
                .select(Columns.list("episode_guid", "position_seconds", "position_pct", "completed")) {
                    filter { isIn("episode_guid", guids) }
                }.decodeList<ProgressDetailRow>().associateBy { it.episodeGuid }
        }

        val episodeMap = episodesDeferred.await()
        val progressMap = progressDeferred.await()

        linkRows.mapNotNull { link ->
            val ep = episodeMap[link.episodeGuid] ?: return@mapNotNull null
            val audioUrl = ep.audioUrl ?: return@mapNotNull null
            val progress = progressMap[link.episodeGuid]
            PlaylistEpisode(
                id = link.id,
                guid = link.episodeGuid,
                feedUrl = link.feedUrl,
                position = link.position,
                title = ep.title ?: "",
                podcastTitle = ep.podcastTitle ?: "",
                artworkUrl = ep.artworkUrl,
                audioUrl = audioUrl,
                durationSeconds = ep.duration,
                positionSeconds = progress?.positionSeconds,
                positionPct = progress?.positionPct,
                completed = progress?.completed ?: false,
            )
        }
    }

    override suspend fun addEpisode(playlistId: String, episode: EpisodePayload) {
        supabaseClient.from("episodes").upsert(
            EpisodeUpsertRow(
                guid = episode.guid, feedUrl = episode.feedUrl, title = episode.title,
                audioUrl = episode.audioUrl, duration = episode.durationSeconds,
                pubDate = episode.pubDate,
                podcastTitle = episode.podcastTitle, artworkUrl = episode.artworkUrl,
            )
        ) { onConflict = "feed_url,guid" }
        val positions = supabaseClient.from("playlist_episodes")
            .select(Columns.list("position")) { filter { eq("playlist_id", playlistId) } }
            .decodeList<PositionRow>()
        val nextPosition = (positions.maxOfOrNull { it.position } ?: -1) + 1
        supabaseClient.from("playlist_episodes").upsert(
            PlaylistEpisodeInsertRow(playlistId = playlistId, episodeGuid = episode.guid, feedUrl = episode.feedUrl, position = nextPosition)
        ) { onConflict = "playlist_id,episode_guid" }
    }

    override suspend fun removeEpisode(playlistId: String, guid: String) {
        supabaseClient.from("playlist_episodes").delete {
            filter { eq("playlist_id", playlistId); eq("episode_guid", guid) }
        }
    }

    override suspend fun reorderEpisodes(playlistId: String, orderedGuids: List<String>) {
        coroutineScope {
            orderedGuids.mapIndexed { index, guid ->
                async {
                    supabaseClient.from("playlist_episodes").update({ set("position", index) }) {
                        filter { eq("playlist_id", playlistId); eq("episode_guid", guid) }
                    }
                }
            }.awaitAll()
        }
    }
}
