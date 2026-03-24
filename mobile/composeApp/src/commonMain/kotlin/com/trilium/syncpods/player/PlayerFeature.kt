package com.trilium.syncpods.player

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class PlayerState(
    val nowPlaying: NowPlaying? = null,
    val isPlaying: Boolean = false,
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
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class PlayerEffect

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class PlayerFeature(
    scope: CoroutineScope,
    private val audioPlayer: AudioPlayer,
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
                    audioPlayer.play(action.episode.audioUrl)
                    emit(PlayerResult.NowPlayingSet(action.episode))
                    emit(PlayerResult.PlaybackToggled(true))
                }
                is PlayerAction.Pause -> flow {
                    audioPlayer.pause()
                    emit(PlayerResult.PlaybackToggled(false))
                }
                is PlayerAction.Resume -> flow {
                    audioPlayer.resume()
                    emit(PlayerResult.PlaybackToggled(true))
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: PlayerState,
        result: PlayerResult,
    ): PlayerState = when (result) {
        is PlayerResult.NowPlayingSet -> previous.copy(nowPlaying = result.episode)
        is PlayerResult.PlaybackToggled -> previous.copy(isPlaying = result.isPlaying)
    }
}
