package com.trilium.syncpods.discover

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class DiscoverState(
    val query: String = "",
    val selectedGenreId: Int = 0,
    val trendingPodcasts: List<PodcastSummary> = emptyList(),
    val searchResults: List<PodcastSummary> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class DiscoverEvent {
    data class QueryChanged(val query: String) : DiscoverEvent()
    data class GenreSelected(val genreId: Int) : DiscoverEvent()
    data class PodcastTapped(val podcast: PodcastSummary) : DiscoverEvent()
    data object ScreenVisible : DiscoverEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class DiscoverAction {
    data class LoadTrending(val genreId: Int) : DiscoverAction()
    data class Search(val query: String, val genreId: Int) : DiscoverAction()
    data class NavigateToPodcast(val podcast: PodcastSummary) : DiscoverAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class DiscoverResult {
    data class TrendingLoaded(val podcasts: List<PodcastSummary>) : DiscoverResult()
    data class SearchResultsLoaded(val podcasts: List<PodcastSummary>) : DiscoverResult()
    data class SetLoading(val loading: Boolean) : DiscoverResult()
    data class SetError(val message: String?) : DiscoverResult()
    data class QueryUpdated(val query: String) : DiscoverResult()
    data class GenreUpdated(val genreId: Int) : DiscoverResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class DiscoverEffect {
    data class NavigateToPodcastDetail(val feedUrl: String) : DiscoverEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
class DiscoverFeature(
    scope: CoroutineScope,
    private val repository: PodcastRepository,
) : StandardFeature<DiscoverState, DiscoverEvent, DiscoverAction, DiscoverResult, DiscoverEffect>(scope) {

    private val _effects = MutableSharedFlow<DiscoverEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<DiscoverEffect> get() = _effects

    override val initial = DiscoverState()

    override val eventToAction: Interactor<DiscoverEvent, DiscoverAction> = { events ->
        merge(
            events.filterIsInstance<DiscoverEvent.QueryChanged>()
                .debounce(300L)
                .map { DiscoverAction.Search(it.query, state.value.selectedGenreId) },
            events.filterIsInstance<DiscoverEvent.GenreSelected>()
                .map { event ->
                    if (state.value.query.isBlank())
                        DiscoverAction.LoadTrending(event.genreId)
                    else
                        DiscoverAction.Search(state.value.query, event.genreId)
                },
            events.filterIsInstance<DiscoverEvent.PodcastTapped>()
                .map { DiscoverAction.NavigateToPodcast(it.podcast) },
            events.filterIsInstance<DiscoverEvent.ScreenVisible>()
                .map { DiscoverAction.LoadTrending(state.value.selectedGenreId) },
        )
    }

    override val actionToResult: Interactor<DiscoverAction, DiscoverResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is DiscoverAction.LoadTrending -> flow {
                    emit(DiscoverResult.GenreUpdated(action.genreId))
                    emit(DiscoverResult.SetLoading(true))
                    try {
                        val podcasts = repository.fetchTrending(action.genreId.takeIf { it > 0 })
                        emit(DiscoverResult.TrendingLoaded(podcasts))
                        emit(DiscoverResult.SetError(null))
                    } catch (e: Exception) {
                        emit(DiscoverResult.SetError(e.message ?: "Failed to load trending"))
                    } finally {
                        emit(DiscoverResult.SetLoading(false))
                    }
                }

                is DiscoverAction.Search -> flow {
                    emit(DiscoverResult.QueryUpdated(action.query))
                    if (action.query.isBlank()) {
                        emit(DiscoverResult.SearchResultsLoaded(emptyList()))
                        return@flow
                    }
                    emit(DiscoverResult.SetLoading(true))
                    try {
                        val podcasts = repository.searchPodcasts(
                            query = action.query,
                            genreId = action.genreId.takeIf { it > 0 },
                        )
                        emit(DiscoverResult.SearchResultsLoaded(podcasts))
                        emit(DiscoverResult.SetError(null))
                    } catch (e: Exception) {
                        emit(DiscoverResult.SetError(e.message ?: "Search failed"))
                    } finally {
                        emit(DiscoverResult.SetLoading(false))
                    }
                }

                is DiscoverAction.NavigateToPodcast -> flow<DiscoverResult> {
                    _effects.emit(DiscoverEffect.NavigateToPodcastDetail(action.podcast.feedUrl))
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: DiscoverState,
        result: DiscoverResult,
    ): DiscoverState = when (result) {
        is DiscoverResult.TrendingLoaded ->
            previous.copy(trendingPodcasts = result.podcasts)

        is DiscoverResult.SearchResultsLoaded ->
            previous.copy(searchResults = result.podcasts)

        is DiscoverResult.SetLoading ->
            previous.copy(isLoading = result.loading)

        is DiscoverResult.SetError ->
            previous.copy(error = result.message)

        is DiscoverResult.QueryUpdated ->
            previous.copy(query = result.query)

        is DiscoverResult.GenreUpdated ->
            previous.copy(selectedGenreId = result.genreId)
    }
}
