package com.trilium.syncpods.player

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.time.Instant

// ── Interface ─────────────────────────────────────────────────────────────────

interface ProgressRepository {
    suspend fun saveProgress(
        nowPlaying: NowPlaying,
        positionSeconds: Int,
        completed: Boolean,
    )
}

// ── Serializable row types ────────────────────────────────────────────────────

@Serializable
private data class EpisodeUpsertRow(
    @SerialName("guid") val guid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("title") val title: String,
    @SerialName("audio_url") val audioUrl: String,
    @SerialName("duration") val duration: Int?,
    @SerialName("artwork_url") val artworkUrl: String?,
    @SerialName("podcast_title") val podcastTitle: String,
)

@Serializable
private data class PlaybackProgressUpsertRow(
    @SerialName("user_id") val userId: String,
    @SerialName("episode_guid") val episodeGuid: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("position_seconds") val positionSeconds: Int,
    @SerialName("position_pct") val positionPct: Float?,
    @SerialName("completed") val completed: Boolean,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
private data class ListeningDailyUpsertRow(
    @SerialName("user_id") val userId: String,
    @SerialName("date") val date: String,
    @SerialName("seconds_listened") val secondsListened: Int,
)

@Serializable
private data class ListeningDailySelectRow(
    @SerialName("seconds_listened") val secondsListened: Int = 0,
)

@Serializable
private data class ListeningByShowUpsertRow(
    @SerialName("user_id") val userId: String,
    @SerialName("feed_url") val feedUrl: String,
    @SerialName("seconds_listened") val secondsListened: Int,
    @SerialName("episodes_completed") val episodesCompleted: Int,
)

@Serializable
private data class ListeningByShowSelectRow(
    @SerialName("seconds_listened") val secondsListened: Int = 0,
    @SerialName("episodes_completed") val episodesCompleted: Int = 0,
)

// ── Supabase implementation ───────────────────────────────────────────────────

class SupabaseProgressRepository(
    private val supabaseClient: SupabaseClient,
) : ProgressRepository {

    private var lastSaveInstant: Instant? = null

    override suspend fun saveProgress(
        nowPlaying: NowPlaying,
        positionSeconds: Int,
        completed: Boolean,
    ) {
        val userId = supabaseClient.auth.currentUserOrNull()?.id ?: return

        val duration = nowPlaying.durationSeconds
        val positionPct: Float? = if (duration != null && duration > 0) {
            (positionSeconds.toFloat() / duration.toFloat() * 100f).coerceIn(0f, 100f)
        } else {
            null
        }

        // Upsert episode metadata
        supabaseClient.from("episodes").upsert(
            EpisodeUpsertRow(
                guid = nowPlaying.guid,
                feedUrl = nowPlaying.feedUrl,
                title = nowPlaying.title,
                audioUrl = nowPlaying.audioUrl,
                duration = nowPlaying.durationSeconds,
                artworkUrl = nowPlaying.artworkUrl.takeIf { it.isNotEmpty() },
                podcastTitle = nowPlaying.podcastName,
            )
        ) {
            onConflict = "feed_url,guid"
        }

        val now = Clock.System.now()
        val updatedAt = now.toString()

        // Upsert playback progress
        supabaseClient.from("playback_progress").upsert(
            PlaybackProgressUpsertRow(
                userId = userId,
                episodeGuid = nowPlaying.guid,
                feedUrl = nowPlaying.feedUrl,
                positionSeconds = positionSeconds,
                positionPct = positionPct,
                completed = completed,
                updatedAt = updatedAt,
            )
        ) {
            onConflict = "user_id,episode_guid"
        }

        // Compute delta since last save
        val previous = lastSaveInstant
        val deltaSeconds = if (previous != null) {
            (now - previous).inWholeSeconds.coerceIn(0L, 15L).toInt()
        } else {
            0
        }
        lastSaveInstant = now

        val date = now.toString().substring(0, 10) // "YYYY-MM-DD" UTC

        if (deltaSeconds > 0) {
            // Upsert listening_daily
            val existingDaily = supabaseClient.from("listening_daily").select(
                Columns.list("seconds_listened")
            ) {
                filter {
                    eq("user_id", userId)
                    eq("date", date)
                }
            }.decodeList<ListeningDailySelectRow>().firstOrNull()

            supabaseClient.from("listening_daily").upsert(
                ListeningDailyUpsertRow(
                    userId = userId,
                    date = date,
                    secondsListened = (existingDaily?.secondsListened ?: 0) + deltaSeconds,
                )
            ) {
                onConflict = "user_id,date"
            }

            // Upsert listening_by_show
            val existingByShow = supabaseClient.from("listening_by_show").select(
                Columns.list("seconds_listened", "episodes_completed")
            ) {
                filter {
                    eq("user_id", userId)
                    eq("feed_url", nowPlaying.feedUrl)
                }
            }.decodeList<ListeningByShowSelectRow>().firstOrNull()

            val completedIncrement = if (completed) 1 else 0
            supabaseClient.from("listening_by_show").upsert(
                ListeningByShowUpsertRow(
                    userId = userId,
                    feedUrl = nowPlaying.feedUrl,
                    secondsListened = (existingByShow?.secondsListened ?: 0) + deltaSeconds,
                    episodesCompleted = (existingByShow?.episodesCompleted ?: 0) + completedIncrement,
                )
            ) {
                onConflict = "user_id,feed_url"
            }
        } else if (completed) {
            // delta == 0 but completed: still increment episodes_completed in listening_by_show
            val existingByShow = supabaseClient.from("listening_by_show").select(
                Columns.list("seconds_listened", "episodes_completed")
            ) {
                filter {
                    eq("user_id", userId)
                    eq("feed_url", nowPlaying.feedUrl)
                }
            }.decodeList<ListeningByShowSelectRow>().firstOrNull()

            supabaseClient.from("listening_by_show").upsert(
                ListeningByShowUpsertRow(
                    userId = userId,
                    feedUrl = nowPlaying.feedUrl,
                    secondsListened = existingByShow?.secondsListened ?: 0,
                    episodesCompleted = (existingByShow?.episodesCompleted ?: 0) + 1,
                )
            ) {
                onConflict = "user_id,feed_url"
            }
        }
    }
}
