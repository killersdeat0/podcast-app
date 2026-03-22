package com.trilium.syncpods.discover

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.podcastdetail.PodcastSummaryCache
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class DiscoverState(
    val selectedGenreId: Int = 0,
    val trendingPodcasts: List<PodcastSummary> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val suggestions: List<PodcastSummary> = emptyList(),
    val isSuggestionsLoading: Boolean = false,
    val suggestionsQuery: String = "",
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class DiscoverEvent {
    data class SearchSubmitted(val query: String) : DiscoverEvent()
    data class GenreSelected(val genreId: Int) : DiscoverEvent()
    data class PodcastTapped(val podcast: PodcastSummary) : DiscoverEvent()
    data object ScreenVisible : DiscoverEvent()
    data class SearchQueryChanged(val query: String) : DiscoverEvent()
    data class SuggestionTapped(val podcast: PodcastSummary) : DiscoverEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class DiscoverAction {
    data class LoadTrending(val genreId: Int) : DiscoverAction()
    data class NavigateToSearch(val query: String) : DiscoverAction()
    data class NavigateToPodcast(val podcast: PodcastSummary) : DiscoverAction()
    data class FetchSuggestions(val query: String) : DiscoverAction()
    data object ClearSuggestions : DiscoverAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class DiscoverResult {
    data class TrendingLoaded(val podcasts: List<PodcastSummary>) : DiscoverResult()
    data class SetLoading(val loading: Boolean) : DiscoverResult()
    data class SetError(val message: String?) : DiscoverResult()
    data class GenreUpdated(val genreId: Int) : DiscoverResult()
    data class SuggestionsLoaded(val podcasts: List<PodcastSummary>, val query: String) : DiscoverResult()
    data class SetSuggestionsLoading(val loading: Boolean) : DiscoverResult()
    data object SuggestionsCleared : DiscoverResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class DiscoverEffect {
    data class NavigateToPodcastDetail(val feedUrl: String) : DiscoverEffect()
    data class NavigateToSearch(val query: String) : DiscoverEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class DiscoverFeature(
    scope: CoroutineScope,
    private val repository: PodcastRepository,
    private val cache: PodcastSummaryCache,
) : StandardFeature<DiscoverState, DiscoverEvent, DiscoverAction, DiscoverResult, DiscoverEffect>(scope) {

    private val _effects = MutableSharedFlow<DiscoverEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<DiscoverEffect> get() = _effects

    override val initial = DiscoverState()

    override val eventToAction: Interactor<DiscoverEvent, DiscoverAction> = { events ->
        merge(
            events.filterIsInstance<DiscoverEvent.SearchSubmitted>()
                .filter { it.query.isNotBlank() }
                .map { DiscoverAction.NavigateToSearch(it.query) },
            events.filterIsInstance<DiscoverEvent.GenreSelected>()
                .map { DiscoverAction.LoadTrending(it.genreId) },
            events.filterIsInstance<DiscoverEvent.PodcastTapped>()
                .map { DiscoverAction.NavigateToPodcast(it.podcast) },
            events.filterIsInstance<DiscoverEvent.ScreenVisible>()
                .map { DiscoverAction.LoadTrending(state.value.selectedGenreId) },
            events.filterIsInstance<DiscoverEvent.SearchQueryChanged>()
                .flatMapLatest { event ->
                    if (event.query.isBlank()) flowOf<DiscoverAction>(DiscoverAction.ClearSuggestions)
                    else flow<DiscoverAction> {
                        delay(300)
                        val s = state.value
                        if (s.suggestions.isNotEmpty() && s.suggestionsQuery == event.query) return@flow
                        emit(DiscoverAction.FetchSuggestions(event.query))
                    }
                },
            events.filterIsInstance<DiscoverEvent.SuggestionTapped>()
                .map { DiscoverAction.NavigateToPodcast(it.podcast) },
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

                is DiscoverAction.NavigateToSearch -> flow<DiscoverResult> {
                    _effects.emit(DiscoverEffect.NavigateToSearch(action.query))
                }

                is DiscoverAction.NavigateToPodcast -> flow<DiscoverResult> {
                    cache.put(action.podcast.feedUrl, action.podcast)
                    _effects.emit(DiscoverEffect.NavigateToPodcastDetail(action.podcast.feedUrl))
                }

                is DiscoverAction.FetchSuggestions -> flow {
                    emit(DiscoverResult.SetSuggestionsLoading(true))
                    try {
                        val results = repository.searchPodcasts(action.query)
                        emit(DiscoverResult.SuggestionsLoaded(results.take(5), action.query))
                    } catch (e: Exception) {
                        emit(DiscoverResult.SuggestionsLoaded(emptyList(), action.query))
                    } finally {
                        emit(DiscoverResult.SetSuggestionsLoading(false))
                    }
                }

                is DiscoverAction.ClearSuggestions -> flow {
                    emit(DiscoverResult.SuggestionsCleared)
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

        is DiscoverResult.SetLoading ->
            previous.copy(isLoading = result.loading)

        is DiscoverResult.SetError ->
            previous.copy(error = result.message)

        is DiscoverResult.GenreUpdated ->
            previous.copy(selectedGenreId = result.genreId)

        is DiscoverResult.SuggestionsLoaded ->
            previous.copy(suggestions = result.podcasts, suggestionsQuery = result.query)

        is DiscoverResult.SetSuggestionsLoading ->
            previous.copy(isSuggestionsLoading = result.loading)

        is DiscoverResult.SuggestionsCleared ->
            previous.copy(suggestions = emptyList(), isSuggestionsLoading = false)
    }
}
