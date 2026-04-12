package com.trilium.syncpods.player

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.time.Instant

// ── Interface ─────────────────────────────────────────────────────────────────

interface ProgressRepository {
    val progressSaved: SharedFlow<Unit>
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
    @SerialName("position_pct") val positionPct: Int?,
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
    @SerialName("last_listened_at") val lastListenedAt: String,
)

@Serializable
private data class ListeningByShowSelectRow(
    @SerialName("seconds_listened") val secondsListened: Int = 0,
    @SerialName("episodes_completed") val episodesCompleted: Int = 0,
)

// ── Pure computation helpers (internal so commonTest can access them) ─────────

internal fun computePositionPct(positionSeconds: Int, durationSeconds: Int?): Int? {
    if (durationSeconds == null || durationSeconds <= 0) return null
    return (positionSeconds.toFloat() / durationSeconds.toFloat() * 100f).coerceIn(0f, 100f).toInt()
}

internal fun computeDeltaSeconds(lastInstant: Instant?, now: Instant): Int {
    if (lastInstant == null) return 0
    return (now - lastInstant).inWholeSeconds.coerceIn(0L, 15L).toInt()
}

// ── Supabase implementation ───────────────────────────────────────────────────

class SupabaseProgressRepository(
    private val supabaseClient: SupabaseClient,
) : ProgressRepository {

    private var lastSaveInstant: Instant? = null

    private val _progressSaved = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    override val progressSaved: SharedFlow<Unit> get() = _progressSaved

    override suspend fun saveProgress(
        nowPlaying: NowPlaying,
        positionSeconds: Int,
        completed: Boolean,
    ) {
        val userId = supabaseClient.auth.currentUserOrNull()?.id ?: return

        val positionPct = computePositionPct(positionSeconds, nowPlaying.durationSeconds)

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

        val deltaSeconds = computeDeltaSeconds(lastSaveInstant, now)
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
                    lastListenedAt = updatedAt,
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
                    lastListenedAt = updatedAt,
                )
            ) {
                onConflict = "user_id,feed_url"
            }
        }

        _progressSaved.emit(Unit)
    }
}
