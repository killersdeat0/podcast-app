package com.trilium.syncpods.history

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.profile.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

// ── State ─────────────────────────────────────────────────────────────────────

enum class HistoryTab { All, InProgress }

data class HistoryState(
    val allGroups: List<DateGroup> = emptyList(),
    val inProgressItems: List<HistoryItem> = emptyList(),
    val activeTab: HistoryTab = HistoryTab.All,
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class HistoryEvent {
    data object ScreenVisible : HistoryEvent()
    data object RetryTapped : HistoryEvent()
    data object ProgressSaved : HistoryEvent()
    data class TabSelected(val tab: HistoryTab) : HistoryEvent()
    data class EpisodeTapped(val item: HistoryItem) : HistoryEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class HistoryAction {
    data object Load : HistoryAction()
    data object SilentLoad : HistoryAction()
    data class SwitchTab(val tab: HistoryTab) : HistoryAction()
    data class PlayEpisode(val item: HistoryItem) : HistoryAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class HistoryResult {
    data object Loading : HistoryResult()
    data class Loaded(val items: List<HistoryItem>) : HistoryResult()
    data class LoadError(val message: String) : HistoryResult()
    data class TabSwitched(val tab: HistoryTab) : HistoryResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class HistoryEffect {
    data class PlayEpisode(val item: HistoryItem) : HistoryEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class HistoryFeature(
    scope: CoroutineScope,
    private val repository: HistoryRepository,
    private val profileRepository: ProfileRepository,
    progressUpdates: Flow<Unit> = emptyFlow(),
) : StandardFeature<HistoryState, HistoryEvent, HistoryAction, HistoryResult, HistoryEffect>(scope) {

    private val _effects = MutableSharedFlow<HistoryEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<HistoryEffect> get() = _effects

    init {
        scope.launch {
            progressUpdates.collect { process(HistoryEvent.ProgressSaved) }
        }
    }

    override val initial = HistoryState()

    override val eventToAction: Interactor<HistoryEvent, HistoryAction> = { events ->
        merge(
            events.filterIsInstance<HistoryEvent.ScreenVisible>().map { HistoryAction.Load },
            events.filterIsInstance<HistoryEvent.RetryTapped>().map { HistoryAction.Load },
            events.filterIsInstance<HistoryEvent.ProgressSaved>().map { HistoryAction.SilentLoad },
            events.filterIsInstance<HistoryEvent.TabSelected>().map { HistoryAction.SwitchTab(it.tab) },
            events.filterIsInstance<HistoryEvent.EpisodeTapped>().map { HistoryAction.PlayEpisode(it.item) },
        )
    }

    override val actionToResult: Interactor<HistoryAction, HistoryResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is HistoryAction.Load -> flow {
                    emit(HistoryResult.Loading)
                    try {
                        val tier = profileRepository.getUserTier()
                        val items = repository.getHistory(isFreeTier = tier == "free")
                        emit(HistoryResult.Loaded(items))
                    } catch (e: Exception) {
                        emit(HistoryResult.LoadError(e.message ?: "Failed to load history"))
                    }
                }
                is HistoryAction.SilentLoad -> flow {
                    try {
                        val tier = profileRepository.getUserTier()
                        val items = repository.getHistory(isFreeTier = tier == "free")
                        emit(HistoryResult.Loaded(items))
                    } catch (e: Exception) {
                        emit(HistoryResult.LoadError(e.message ?: "Failed to load history"))
                    }
                }
                is HistoryAction.SwitchTab -> flowOf<HistoryResult>(HistoryResult.TabSwitched(action.tab))
                is HistoryAction.PlayEpisode -> flow<HistoryResult> {
                    _effects.emit(HistoryEffect.PlayEpisode(action.item))
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: HistoryState,
        result: HistoryResult,
    ): HistoryState = when (result) {
        is HistoryResult.Loading -> previous.copy(isLoading = true, error = null)
        is HistoryResult.Loaded -> previous.copy(
            isLoading = false,
            error = null,
            allGroups = groupByDate(result.items),
            inProgressItems = result.items.filter { it.isInProgress() },
        )
        is HistoryResult.LoadError -> previous.copy(isLoading = false, error = result.message)
        is HistoryResult.TabSwitched -> previous.copy(activeTab = result.tab)
    }
}

// ── Date grouping ─────────────────────────────────────────────────────────────

private fun groupByDate(items: List<HistoryItem>): List<DateGroup> {
    val tz = TimeZone.currentSystemDefault()
    val now = Clock.System.now()
    val today = now.toLocalDateTime(tz).date
    val sevenDaysAgo = Instant.fromEpochMilliseconds(
        now.toEpochMilliseconds() - 7L * 24 * 60 * 60 * 1000
    )

    val todayItems = mutableListOf<HistoryItem>()
    val thisWeekItems = mutableListOf<HistoryItem>()
    val earlierItems = mutableListOf<HistoryItem>()

    for (item in items) {
        val itemInstant = Instant.parse(item.updatedAt)
        val itemDate = itemInstant.toLocalDateTime(tz).date
        when {
            itemDate == today -> todayItems.add(item)
            itemInstant >= sevenDaysAgo -> thisWeekItems.add(item)
            else -> earlierItems.add(item)
        }
    }

    return buildList {
        if (todayItems.isNotEmpty()) add(DateGroup("Today", todayItems))
        if (thisWeekItems.isNotEmpty()) add(DateGroup("This Week", thisWeekItems))
        if (earlierItems.isNotEmpty()) add(DateGroup("Earlier", earlierItems))
    }
}
