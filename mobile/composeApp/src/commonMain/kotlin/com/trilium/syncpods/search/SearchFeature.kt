package com.trilium.syncpods.search

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.discover.PodcastRepository
import com.trilium.syncpods.discover.PodcastSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class SearchState(
    val query: String = "",
    val results: List<PodcastSummary> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class SearchEvent {
    data object ScreenVisible : SearchEvent()
    data class QueryChanged(val query: String) : SearchEvent()
    data object SearchSubmitted : SearchEvent()
    data class PodcastTapped(val podcast: PodcastSummary) : SearchEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class SearchAction {
    data class UpdateQuery(val query: String) : SearchAction()
    data class Search(val query: String) : SearchAction()
    data class NavigateToPodcast(val podcast: PodcastSummary) : SearchAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class SearchResult {
    data class QueryUpdated(val query: String) : SearchResult()
    data class ResultsLoaded(val podcasts: List<PodcastSummary>) : SearchResult()
    data class SetLoading(val loading: Boolean) : SearchResult()
    data class SetError(val message: String?) : SearchResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class SearchEffect {
    data class NavigateToPodcastDetail(val feedUrl: String) : SearchEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class SearchFeature(
    scope: CoroutineScope,
    private val repository: PodcastRepository,
    private val initialQuery: String = "",
) : StandardFeature<SearchState, SearchEvent, SearchAction, SearchResult, SearchEffect>(scope) {

    private val _effects = MutableSharedFlow<SearchEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<SearchEffect> get() = _effects

    override val initial = SearchState(query = initialQuery)

    override val eventToAction: Interactor<SearchEvent, SearchAction> = { events ->
        merge(
            // Fire the initial search when the screen becomes visible
            events.filterIsInstance<SearchEvent.ScreenVisible>()
                .filter { initialQuery.isNotBlank() }
                .map { SearchAction.Search(initialQuery) },

            // Immediate local text update (no API call)
            events.filterIsInstance<SearchEvent.QueryChanged>()
                .map { SearchAction.UpdateQuery(it.query) },

            // Explicit submit → fire search with current query
            events.filterIsInstance<SearchEvent.SearchSubmitted>()
                .filter { state.value.query.isNotBlank() }
                .map { SearchAction.Search(state.value.query) },

            events.filterIsInstance<SearchEvent.PodcastTapped>()
                .map { SearchAction.NavigateToPodcast(it.podcast) },
        )
    }

    override val actionToResult: Interactor<SearchAction, SearchResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is SearchAction.UpdateQuery -> flow {
                    emit(SearchResult.QueryUpdated(action.query))
                    if (action.query.isBlank()) {
                        emit(SearchResult.ResultsLoaded(emptyList()))
                    }
                }

                is SearchAction.Search -> flow {
                    emit(SearchResult.SetLoading(true))
                    try {
                        val podcasts = repository.searchPodcasts(action.query)
                        emit(SearchResult.ResultsLoaded(podcasts))
                        emit(SearchResult.SetError(null))
                    } catch (e: Exception) {
                        emit(SearchResult.SetError(e.message ?: "Search failed"))
                    } finally {
                        emit(SearchResult.SetLoading(false))
                    }
                }

                is SearchAction.NavigateToPodcast -> flow<SearchResult> {
                    _effects.emit(SearchEffect.NavigateToPodcastDetail(action.podcast.feedUrl))
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: SearchState,
        result: SearchResult,
    ): SearchState = when (result) {
        is SearchResult.QueryUpdated -> previous.copy(query = result.query)
        is SearchResult.ResultsLoaded -> previous.copy(results = result.podcasts)
        is SearchResult.SetLoading -> previous.copy(isLoading = result.loading)
        is SearchResult.SetError -> previous.copy(error = result.message)
    }
}
