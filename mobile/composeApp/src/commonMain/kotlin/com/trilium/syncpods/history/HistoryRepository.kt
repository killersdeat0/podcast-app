package com.trilium.syncpods.history

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.datetime.Instant
import kotlin.time.Clock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.Duration.Companion.days

private const val COMPLETION_THRESHOLD_PCT = 98f
private const val FREE_TIER_HISTORY_DAYS = 30L

// ── Domain model ──────────────────────────────────────────────────────────────

data class HistoryItem(
    val guid: String,
    val feedUrl: String,
    val positionSeconds: Int,
    val positionPct: Float?,
    val completed: Boolean,
    val updatedAt: String,         // ISO8601
    val title: String,
    val podcastTitle: String,
    val artworkUrl: String?,
    val audioUrl: String,
    val durationSeconds: Int?,
)

data class DateGroup(val label: String, val items: List<HistoryItem>)

/** Matches web constants.ts: started (>30s), not completed, under 98% */
fun HistoryItem.isInProgress(): Boolean =
    !completed && positionSeconds > 30 && positionPct != null && positionPct < COMPLETION_THRESHOLD_PCT

// ── Interface ─────────────────────────────────────────────────────────────────

interface HistoryRepository {
    suspend fun getHistory(isFreeTier: Boolean): List<HistoryItem>
}

// ── Serializable row types ────────────────────────────────────────────────────

@Serializable
private data class PlaybackProgressRow(
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position_seconds") val positionSeconds: Int,
    @SerialName("position_pct") val positionPct: Float? = null,
    @SerialName("completed") val completed: Boolean = false,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
private data class EpisodeRow(
    @SerialName("guid") val guid: String,
    @SerialName("title") val title: String? = null,
    @SerialName("audio_url") val audioUrl: String? = null,
    @SerialName("duration") val duration: Int? = null,
    @SerialName("artwork_url") val artworkUrl: String? = null,
    @SerialName("podcast_title") val podcastTitle: String? = null,
)

@Serializable
private data class SubscriptionArtworkRow(
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("artwork_url") val artworkUrl: String? = null,
)

// ── Supabase implementation ───────────────────────────────────────────────────

class SupabaseHistoryRepository(
    private val supabaseClient: SupabaseClient,
) : HistoryRepository {

    override suspend fun getHistory(isFreeTier: Boolean): List<HistoryItem> {
        val thirtyDaysAgoIso = (Clock.System.now() - FREE_TIER_HISTORY_DAYS.days).toString()

        val progressRows = supabaseClient.from("playback_progress").select(
            Columns.list("episode_guid", "feed_url", "position_seconds", "position_pct", "completed", "updated_at")
        ) {
            filter {
                gt("position_seconds", 0)
                if (isFreeTier) gte("updated_at", thirtyDaysAgoIso)
            }
            order("updated_at", order = Order.DESCENDING)
        }.decodeList<PlaybackProgressRow>()

        if (progressRows.isEmpty()) return emptyList()

        val guids = progressRows.map { it.episodeGuid }
        val feedUrls = progressRows.map { it.feedUrl }.distinct()

        return coroutineScope {
            val episodesDeferred = async {
                supabaseClient.from("episodes").select(
                    Columns.list("guid", "title", "audio_url", "duration", "artwork_url", "podcast_title")
                ) {
                    filter { isIn("guid", guids) }
                }.decodeList<EpisodeRow>()
            }
            val subscriptionsDeferred = async {
                supabaseClient.from("subscriptions").select(
                    Columns.list("feed_url", "artwork_url")
                ) {
                    filter { isIn("feed_url", feedUrls) }
                }.decodeList<SubscriptionArtworkRow>()
            }

            val episodeMap = episodesDeferred.await().associateBy { it.guid }
            val subArtworkMap = subscriptionsDeferred.await().associate { it.feedUrl to it.artworkUrl }

            progressRows.mapNotNull { row ->
                val ep = episodeMap[row.episodeGuid] ?: return@mapNotNull null
                val audioUrl = ep.audioUrl ?: return@mapNotNull null
                HistoryItem(
                    guid = row.episodeGuid,
                    feedUrl = row.feedUrl,
                    positionSeconds = row.positionSeconds,
                    positionPct = row.positionPct,
                    completed = row.completed,
                    updatedAt = row.updatedAt,
                    title = ep.title ?: "",
                    podcastTitle = ep.podcastTitle ?: "",
                    artworkUrl = subArtworkMap[row.feedUrl] ?: ep.artworkUrl,
                    audioUrl = audioUrl,
                    durationSeconds = ep.duration,
                )
            }
        }
    }
}
