package com.trilium.syncpods.queue

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
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
    suspend fun getQueuedGuids(): Set<String>
    suspend fun getUserTier(): String
    suspend fun removeEpisode(guid: String)
    suspend fun reorderQueue(orderedGuids: List<String>)
    suspend fun addEpisode(
        guid: String,
        feedUrl: String,
        title: String,
        audioUrl: String,
        durationSeconds: Int?,
        pubDate: String?,
        podcastTitle: String,
        artworkUrl: String?,
    )
    fun isGuest(): Boolean
}

// ── Serializable row classes ──────────────────────────────────────────────────

@Serializable
private data class QueueBaseRow(
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
private data class UserProfileRow(
    @SerialName("tier") val tier: String,
)

@Serializable
private data class QueueGuidRow(
    @SerialName("episode_guid") val episodeGuid: String,
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
private data class QueueInsertRow(
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position") val position: Int,
    @SerialName("user_id") val userId: String,
)

@Serializable
private data class QueuePositionRow(
    @SerialName("position") val position: Int,
)

// ── Implementation ────────────────────────────────────────────────────────────

class QueueRepositoryImpl(
    private val supabaseClient: SupabaseClient,
) : QueueRepository {

    override fun isGuest(): Boolean = supabaseClient.auth.currentUserOrNull() == null

    override suspend fun getQueue(): List<QueueItem> {
        val queueRows = supabaseClient.from("queue")
            .select(Columns.list("episode_guid", "feed_url", "position"))
            .decodeList<QueueBaseRow>()
        if (queueRows.isEmpty()) return emptyList()
        val guids = queueRows.map { it.episodeGuid }
        val episodeRows = supabaseClient.from("episodes")
            .select(Columns.list("guid", "title", "audio_url", "duration", "artwork_url", "podcast_title")) {
                filter { isIn("guid", guids) }
            }.decodeList<EpisodeMetaRow>()
        val episodeMap = episodeRows.associateBy { it.guid }
        return queueRows
            .sortedBy { it.position }
            .mapNotNull { row ->
                val ep = episodeMap[row.episodeGuid] ?: return@mapNotNull null
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

    override suspend fun getQueuedGuids(): Set<String> {
        val rows = supabaseClient.from("queue").select(Columns.list("episode_guid"))
            .decodeList<QueueGuidRow>()
        return rows.map { it.episodeGuid }.toSet()
    }

    override suspend fun addEpisode(
        guid: String,
        feedUrl: String,
        title: String,
        audioUrl: String,
        durationSeconds: Int?,
        pubDate: String?,
        podcastTitle: String,
        artworkUrl: String?,
    ) {
        val userId = supabaseClient.auth.currentUserOrNull()?.id ?: return
        supabaseClient.from("episodes").upsert(
            EpisodeUpsertRow(
                guid = guid,
                feedUrl = feedUrl,
                title = title,
                audioUrl = audioUrl,
                duration = durationSeconds,
                pubDate = pubDate,
                podcastTitle = podcastTitle,
                artworkUrl = artworkUrl,
            )
        ) {
            onConflict = "feed_url,guid"
        }
        val positions = supabaseClient.from("queue").select(Columns.list("position"))
            .decodeList<QueuePositionRow>()
        val nextPosition = (positions.maxOfOrNull { it.position } ?: 0) + 1
        supabaseClient.from("queue").upsert(
            QueueInsertRow(
                episodeGuid = guid,
                feedUrl = feedUrl,
                position = nextPosition,
                userId = userId,
            )
        ) {
            onConflict = "user_id,episode_guid"
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
