package com.trilium.syncpods.queue

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Public model ──────────────────────────────────────────────────────────────

data class QueueItem(
    val guid: String,
    val feedUrl: String,
    val position: Int,
    val title: String,
    val podcastTitle: String,
    val artworkUrl: String?,
    val audioUrl: String,
    val durationSeconds: Int?,
)

// ── Interface ─────────────────────────────────────────────────────────────────

interface QueueRepository {
    suspend fun getQueue(): List<QueueItem>
    suspend fun getUserTier(): String
    suspend fun removeEpisode(guid: String)
    suspend fun reorderQueue(orderedGuids: List<String>)
    fun isGuest(): Boolean
}

// ── Serializable row classes ──────────────────────────────────────────────────

@Serializable
private data class EpisodeRow(
    @SerialName("title") val title: String? = null,
    @SerialName("audio_url") val audioUrl: String? = null,
    @SerialName("duration") val duration: Int? = null,
    @SerialName("artwork_url") val artworkUrl: String? = null,
    @SerialName("podcast_title") val podcastTitle: String? = null,
)

@Serializable
private data class QueueRow(
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position") val position: Int,
    @SerialName("episodes") val episode: EpisodeRow? = null,
)

@Serializable
private data class UserProfileRow(
    @SerialName("tier") val tier: String,
)

// ── Implementation ────────────────────────────────────────────────────────────

class QueueRepositoryImpl(
    private val supabaseClient: SupabaseClient,
) : QueueRepository {

    override fun isGuest(): Boolean = supabaseClient.auth.currentUserOrNull() == null

    override suspend fun getQueue(): List<QueueItem> {
        val rows = supabaseClient.from("queue").select {
            filter { }
        }.decodeList<QueueRow>()
        return rows
            .sortedBy { it.position }
            .mapNotNull { row ->
                val ep = row.episode ?: return@mapNotNull null
                val audioUrl = ep.audioUrl ?: return@mapNotNull null
                QueueItem(
                    guid = row.episodeGuid,
                    feedUrl = row.feedUrl,
                    position = row.position,
                    title = ep.title ?: "",
                    podcastTitle = ep.podcastTitle ?: "",
                    artworkUrl = ep.artworkUrl,
                    audioUrl = audioUrl,
                    durationSeconds = ep.duration,
                )
            }
    }

    override suspend fun getUserTier(): String {
        return try {
            val rows = supabaseClient.from("user_profiles").select {
                filter { }
                limit(1)
            }.decodeList<UserProfileRow>()
            rows.firstOrNull()?.tier ?: "free"
        } catch (_: Exception) {
            "free"
        }
    }

    override suspend fun removeEpisode(guid: String) {
        supabaseClient.from("queue").delete {
            filter { eq("episode_guid", guid) }
        }
    }

    override suspend fun reorderQueue(orderedGuids: List<String>) {
        coroutineScope {
            orderedGuids.mapIndexed { index, guid ->
                async {
                    supabaseClient.from("queue").update(
                        { set("position", index) }
                    ) {
                        filter { eq("episode_guid", guid) }
                    }
                }
            }.awaitAll()
        }
    }
}
