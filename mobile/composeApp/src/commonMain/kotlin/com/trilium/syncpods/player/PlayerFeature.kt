package com.trilium.syncpods.player

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

private const val SAVE_INTERVAL_MS = 10_000L
private const val MIN_POSITION_TO_SAVE_SECONDS = 5
private const val COMPLETION_THRESHOLD_PCT = 98f

// ── State ─────────────────────────────────────────────────────────────────────

data class PlayerState(
    val nowPlaying: NowPlaying? = null,
    val isPlaying: Boolean = false,
    val hasCompleted: Boolean = false,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class PlayerEvent {
    data class Play(val episode: NowPlaying) : PlayerEvent()
    data object PauseToggled : PlayerEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class PlayerAction {
    data class Play(val episode: NowPlaying) : PlayerAction()
    data object Pause : PlayerAction()
    data object Resume : PlayerAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class PlayerResult {
    data class NowPlayingSet(val episode: NowPlaying) : PlayerResult()
    data class PlaybackToggled(val isPlaying: Boolean) : PlayerResult()
    data object CompletionReached : PlayerResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class PlayerEffect

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class PlayerFeature(
    scope: CoroutineScope,
    private val audioPlayer: AudioPlayer,
    private val progressRepository: ProgressRepository,
    private val profileRepository: ProfileRepository,
) : StandardFeature<PlayerState, PlayerEvent, PlayerAction, PlayerResult, PlayerEffect>(scope) {

    private val _effects = MutableSharedFlow<PlayerEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<PlayerEffect> get() = _effects

    override val initial = PlayerState()

    override val eventToAction: Interactor<PlayerEvent, PlayerAction> = { events ->
        merge(
            events.filterIsInstance<PlayerEvent.Play>()
                .map { PlayerAction.Play(it.episode) },

            events.filterIsInstance<PlayerEvent.PauseToggled>()
                .map { if (state.value.isPlaying) PlayerAction.Pause else PlayerAction.Resume },
        )
    }

    override val actionToResult: Interactor<PlayerAction, PlayerResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is PlayerAction.Play -> flow {
                    // Switch-away save: read current state at action-processing time
                    // (after flatMapLatest has cancelled the previous flow)
                    val currentState = state.value
                    val prev = currentState.nowPlaying
                    if (prev != null && !currentState.hasCompleted && !profileRepository.isGuest()) {
                        val pos = audioPlayer.currentPositionSeconds()
                        if (pos > MIN_POSITION_TO_SAVE_SECONDS) {
                            progressRepository.saveProgress(prev, pos, false)
                        }
                    }

                    audioPlayer.play(action.episode.audioUrl)
                    emit(PlayerResult.NowPlayingSet(action.episode))
                    emit(PlayerResult.PlaybackToggled(true))

                    // Periodic save loop — cancelled automatically by flatMapLatest on next action
                    periodicSaveLoop(action.episode)
                }

                is PlayerAction.Pause -> flow {
                    audioPlayer.pause()
                    emit(PlayerResult.PlaybackToggled(false))
                    // Flow ends — flatMapLatest cancels previous periodic loop
                }

                is PlayerAction.Resume -> flow {
                    audioPlayer.resume()
                    emit(PlayerResult.PlaybackToggled(true))
                    val ep = state.value.nowPlaying ?: return@flow
                    // Restart periodic save loop after resume
                    periodicSaveLoop(ep)
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: PlayerState,
        result: PlayerResult,
    ): PlayerState = when (result) {
        is PlayerResult.NowPlayingSet -> previous.copy(nowPlaying = result.episode, hasCompleted = false)
        is PlayerResult.PlaybackToggled -> previous.copy(isPlaying = result.isPlaying)
        is PlayerResult.CompletionReached -> previous.copy(hasCompleted = true)
    }

    private suspend fun FlowCollector<PlayerResult>.periodicSaveLoop(episode: NowPlaying) {
        while (true) {
            delay(SAVE_INTERVAL_MS)
            if (profileRepository.isGuest() || state.value.hasCompleted) continue
            val pos = audioPlayer.currentPositionSeconds()
            if (pos <= MIN_POSITION_TO_SAVE_SECONDS) continue
            val dur = audioPlayer.durationSeconds()
            if (dur != null && dur > 0 && (pos.toFloat() / dur.toFloat() * 100f) >= COMPLETION_THRESHOLD_PCT) {
                emit(PlayerResult.CompletionReached)
                progressRepository.saveProgress(episode, pos, true)
                return
            }
            progressRepository.saveProgress(episode, pos, false)
        }
    }
}
