package com.trilium.syncpods.queue

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class QueueState(
    val items: List<QueueItem> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val tier: String = "free",
    val nowPlayingGuid: String? = null,
    val showLoginPrompt: Boolean = false,
    val showUpgradeCard: Boolean = false,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class QueueEvent {
    data object ScreenVisible : QueueEvent()
    data class EpisodeTapped(val guid: String) : QueueEvent()
    data class EpisodeRemoved(val guid: String) : QueueEvent()
    data class EpisodesReordered(val orderedGuids: List<String>) : QueueEvent()
    data object UpgradeTapped : QueueEvent()
    data object LoginPromptDismissed : QueueEvent()
    data object RetryTapped : QueueEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class QueueAction {
    data object Load : QueueAction()
    data class RemoveEpisode(val guid: String) : QueueAction()
    data class ReorderQueue(val orderedGuids: List<String>) : QueueAction()
    data class PlayEpisode(val guid: String) : QueueAction()
    data object NavigateToUpgrade : QueueAction()
    data object DismissLoginPrompt : QueueAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class QueueResult {
    data object Loading : QueueResult()
    data class QueueLoaded(val items: List<QueueItem>, val tier: String) : QueueResult()
    data class EpisodeRemoved(val guid: String) : QueueResult()
    data class QueueReordered(val orderedGuids: List<String>) : QueueResult()
    data class LoadError(val message: String) : QueueResult()
    data class NowPlayingChanged(val guid: String) : QueueResult()
    data object LoginPromptShown : QueueResult()
    data object LoginPromptDismissed : QueueResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class QueueEffect {
    data class PlayEpisode(val item: QueueItem) : QueueEffect()
    data object NavigateToUpgrade : QueueEffect()
    data object ShowLoginPrompt : QueueEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class QueueFeature(
    scope: CoroutineScope,
    private val repository: QueueRepository,
    private val profileRepository: ProfileRepository,
) : StandardFeature<QueueState, QueueEvent, QueueAction, QueueResult, QueueEffect>(scope) {

    private val _effects = MutableSharedFlow<QueueEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<QueueEffect> get() = _effects

    override val initial = QueueState()

    override val eventToAction: Interactor<QueueEvent, QueueAction> = { events ->
        merge(
            events.filterIsInstance<QueueEvent.ScreenVisible>()
                .map { QueueAction.Load },

            events.filterIsInstance<QueueEvent.RetryTapped>()
                .map { QueueAction.Load },

            events.filterIsInstance<QueueEvent.EpisodeTapped>()
                .map { QueueAction.PlayEpisode(it.guid) },

            events.filterIsInstance<QueueEvent.EpisodeRemoved>()
                .map { QueueAction.RemoveEpisode(it.guid) },

            events.filterIsInstance<QueueEvent.EpisodesReordered>()
                .map { QueueAction.ReorderQueue(it.orderedGuids) },

            events.filterIsInstance<QueueEvent.UpgradeTapped>()
                .map { QueueAction.NavigateToUpgrade },

            events.filterIsInstance<QueueEvent.LoginPromptDismissed>()
                .map { QueueAction.DismissLoginPrompt },
        )
    }

    override val actionToResult: Interactor<QueueAction, QueueResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is QueueAction.Load -> flow {
                    emit(QueueResult.Loading)
                    try {
                        val items = repository.getQueue()
                        val tier = profileRepository.getUserTier()
                        emit(QueueResult.QueueLoaded(items = items, tier = tier))
                    } catch (e: Exception) {
                        emit(QueueResult.LoadError(e.message ?: "Failed to load queue"))
                    }
                }

                is QueueAction.RemoveEpisode -> flow {
                    try {
                        repository.removeEpisode(action.guid)
                        emit(QueueResult.EpisodeRemoved(action.guid))
                    } catch (_: Exception) {
                        // Leave state unchanged on failure
                    }
                }

                is QueueAction.ReorderQueue -> flow {
                    // Optimistic update
                    emit(QueueResult.QueueReordered(action.orderedGuids))
                    try {
                        repository.reorderQueue(action.orderedGuids)
                    } catch (_: Exception) {
                        // Reload to recover from failed reorder
                        try {
                            val items = repository.getQueue()
                            val tier = profileRepository.getUserTier()
                            emit(QueueResult.QueueLoaded(items = items, tier = tier))
                        } catch (_: Exception) {
                            // Swallow secondary error
                        }
                    }
                }

                is QueueAction.PlayEpisode -> flow<QueueResult> {
                    val item = state.value.items.find { it.guid == action.guid }
                    if (item != null) {
                        _effects.emit(QueueEffect.PlayEpisode(item))
                        emit(QueueResult.NowPlayingChanged(action.guid))
                    }
                }

                is QueueAction.NavigateToUpgrade -> flow<QueueResult> {
                    _effects.emit(QueueEffect.NavigateToUpgrade)
                }

                is QueueAction.DismissLoginPrompt ->
                    flowOf(QueueResult.LoginPromptDismissed)
            }
        }
    }

    override suspend fun handleResult(
        previous: QueueState,
        result: QueueResult,
    ): QueueState = when (result) {
        is QueueResult.Loading -> previous.copy(isLoading = true, error = null)

        is QueueResult.QueueLoaded -> {
            val showUpgradeCard = result.tier == "free" && result.items.size >= 7
            previous.copy(
                items = result.items,
                tier = result.tier,
                isLoading = false,
                error = null,
                showUpgradeCard = showUpgradeCard,
            )
        }

        is QueueResult.EpisodeRemoved -> {
            val updatedItems = previous.items.filter { it.guid != result.guid }
            val showUpgradeCard = previous.tier == "free" && updatedItems.size >= 7
            previous.copy(
                items = updatedItems,
                showUpgradeCard = showUpgradeCard,
            )
        }

        is QueueResult.QueueReordered -> {
            val guidOrder = result.orderedGuids.withIndex().associate { (i, guid) -> guid to i }
            val reordered = previous.items.sortedBy { guidOrder[it.guid] ?: Int.MAX_VALUE }
            previous.copy(items = reordered)
        }

        is QueueResult.LoadError -> previous.copy(isLoading = false, error = result.message)

        is QueueResult.NowPlayingChanged -> previous.copy(nowPlayingGuid = result.guid)

        is QueueResult.LoginPromptShown -> previous.copy(showLoginPrompt = true)

        is QueueResult.LoginPromptDismissed -> previous.copy(showLoginPrompt = false)
    }
}
