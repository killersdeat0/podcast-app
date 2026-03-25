package com.trilium.syncpods.podcastdetail

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.profile.ProfileRepository
import com.trilium.syncpods.queue.QueueRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class PodcastDetailState(
    val podcastTitle: String = "",
    val artistName: String = "",
    val artworkUrl: String = "",
    val genres: List<String> = emptyList(),
    val description: String = "",
    val episodes: List<Episode> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val sortNewestFirst: Boolean = true,
    val isDescriptionExpanded: Boolean = false,
    val isFollowing: Boolean = false,
    val isFollowLoading: Boolean = false,
    val showLoginPrompt: Boolean = false,
    val currentPage: Int = 0,
    val queuedGuids: Set<String> = emptySet(),
    val userTier: String = "free",
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class PodcastDetailEvent {
    data object ScreenVisible : PodcastDetailEvent()
    data object FollowTapped : PodcastDetailEvent()
    data object PlayLatestTapped : PodcastDetailEvent()
    data object SortToggled : PodcastDetailEvent()
    data object ExpandDescriptionTapped : PodcastDetailEvent()
    data class EpisodePlayTapped(val episode: Episode) : PodcastDetailEvent()
    data class EpisodeQueueToggleTapped(val episode: Episode) : PodcastDetailEvent()
    data object LoginPromptDismissed : PodcastDetailEvent()
    data object LoginPromptSignInTapped : PodcastDetailEvent()
    data object LoginPromptCreateAccountTapped : PodcastDetailEvent()
    data object RetryTapped : PodcastDetailEvent()
    data class PageChanged(val page: Int) : PodcastDetailEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class PodcastDetailAction {
    data object LoadScreen : PodcastDetailAction()
    data object Follow : PodcastDetailAction()
    data object Unfollow : PodcastDetailAction()
    data object ShowLoginPrompt : PodcastDetailAction()
    data object DismissLoginPrompt : PodcastDetailAction()
    data object ToggleSort : PodcastDetailAction()
    data object ToggleDescription : PodcastDetailAction()
    data class PlayEpisode(val episode: Episode) : PodcastDetailAction()
    data object PlayLatest : PodcastDetailAction()
    data class AddEpisodeToQueue(val episode: Episode) : PodcastDetailAction()
    data class RemoveEpisodeFromQueue(val episode: Episode) : PodcastDetailAction()
    data object NavigateToSignIn : PodcastDetailAction()
    data object NavigateToCreateAccount : PodcastDetailAction()
    data class ChangePage(val page: Int) : PodcastDetailAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class PodcastDetailResult {
    data class HeaderLoaded(
        val title: String,
        val artistName: String,
        val artworkUrl: String,
        val genres: List<String>,
    ) : PodcastDetailResult()

    data class FeedLoaded(
        val description: String,
        val episodes: List<Episode>,
        val artworkUrl: String,
    ) : PodcastDetailResult()

    data class SetLoading(val loading: Boolean) : PodcastDetailResult()
    data class SetError(val message: String?) : PodcastDetailResult()
    data class SetFollowing(val following: Boolean) : PodcastDetailResult()
    data class SetFollowLoading(val loading: Boolean) : PodcastDetailResult()
    data class SetShowLoginPrompt(val show: Boolean) : PodcastDetailResult()
    data object SortToggled : PodcastDetailResult()
    data object DescriptionToggled : PodcastDetailResult()
    data class PageChanged(val page: Int) : PodcastDetailResult()
    data class QueuedGuidsLoaded(val guids: Set<String>) : PodcastDetailResult()
    data class EpisodeAddedToQueue(val guid: String) : PodcastDetailResult()
    data class EpisodeRemovedFromQueue(val guid: String) : PodcastDetailResult()
    data class UserTierLoaded(val tier: String) : PodcastDetailResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class PodcastDetailEffect {
    data object NavigateBack : PodcastDetailEffect()
    data object NavigateToSignIn : PodcastDetailEffect()
    data object NavigateToCreateAccount : PodcastDetailEffect()
    data class PlayEpisode(val episode: Episode) : PodcastDetailEffect()
    data object PlayLatest : PodcastDetailEffect()
    data object EpisodeQueuedAdded : PodcastDetailEffect()
    data object EpisodeQueuedRemoved : PodcastDetailEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class PodcastDetailFeature(
    scope: CoroutineScope,
    private val feedUrl: String,
    private val feedRepository: EpisodeFeedRepository,
    private val subscriptionRepository: SubscriptionRepository,
    private val summaryCache: PodcastSummaryCache,
    private val queueRepository: QueueRepository,
    private val profileRepository: ProfileRepository,
) : StandardFeature<PodcastDetailState, PodcastDetailEvent, PodcastDetailAction, PodcastDetailResult, PodcastDetailEffect>(
    scope
) {

    private val _effects = MutableSharedFlow<PodcastDetailEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<PodcastDetailEffect> get() = _effects

    override val initial = PodcastDetailState()

    override val eventToAction: Interactor<PodcastDetailEvent, PodcastDetailAction> = { events ->
        merge(
            events.filterIsInstance<PodcastDetailEvent.ScreenVisible>()
                .map { PodcastDetailAction.LoadScreen },

            events.filterIsInstance<PodcastDetailEvent.FollowTapped>()
                .map {
                    when {
                        queueRepository.isGuest() -> PodcastDetailAction.ShowLoginPrompt
                        state.value.isFollowing -> PodcastDetailAction.Unfollow
                        else -> PodcastDetailAction.Follow
                    }
                },

            events.filterIsInstance<PodcastDetailEvent.SortToggled>()
                .map { PodcastDetailAction.ToggleSort },

            events.filterIsInstance<PodcastDetailEvent.ExpandDescriptionTapped>()
                .map { PodcastDetailAction.ToggleDescription },

            events.filterIsInstance<PodcastDetailEvent.EpisodePlayTapped>()
                .map { PodcastDetailAction.PlayEpisode(it.episode) },

            events.filterIsInstance<PodcastDetailEvent.EpisodeQueueToggleTapped>()
                .map {
                    when {
                        state.value.userTier != "paid" && state.value.queuedGuids.size >= 10 -> PodcastDetailAction.ShowLoginPrompt
                        it.episode.guid in state.value.queuedGuids -> PodcastDetailAction.RemoveEpisodeFromQueue(
                            it.episode
                        )

                        else -> PodcastDetailAction.AddEpisodeToQueue(it.episode)
                    }
                },

            events.filterIsInstance<PodcastDetailEvent.PlayLatestTapped>()
                .map { PodcastDetailAction.PlayLatest },

            events.filterIsInstance<PodcastDetailEvent.LoginPromptDismissed>()
                .map { PodcastDetailAction.DismissLoginPrompt },

            events.filterIsInstance<PodcastDetailEvent.LoginPromptSignInTapped>()
                .map { PodcastDetailAction.NavigateToSignIn },

            events.filterIsInstance<PodcastDetailEvent.LoginPromptCreateAccountTapped>()
                .map { PodcastDetailAction.NavigateToCreateAccount },

            events.filterIsInstance<PodcastDetailEvent.RetryTapped>()
                .map { PodcastDetailAction.LoadScreen },

            events.filterIsInstance<PodcastDetailEvent.PageChanged>()
                .map { PodcastDetailAction.ChangePage(it.page) },
        )
    }

    override val actionToResult: Interactor<PodcastDetailAction, PodcastDetailResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is PodcastDetailAction.LoadScreen -> flow {
                    // Hydrate header from cache immediately (zero latency)
                    val cached = summaryCache.get(feedUrl)
                    if (cached != null) {
                        emit(
                            PodcastDetailResult.HeaderLoaded(
                                title = cached.title,
                                artistName = cached.artistName,
                                artworkUrl = cached.artworkUrl,
                                genres = cached.genres,
                            )
                        )
                    }
                    emit(PodcastDetailResult.SetLoading(true))
                    try {
                        val feed = feedRepository.fetchFeed(feedUrl)
                        val following = subscriptionRepository.isFollowing(feedUrl)
                        val queuedGuids = try {
                            queueRepository.getQueuedGuids()
                        } catch (_: Exception) {
                            emptySet()
                        }
                        val tier = try {
                            profileRepository.getUserTier()
                        } catch (_: Exception) {
                            "free"
                        }
                        emit(
                            PodcastDetailResult.FeedLoaded(
                                description = feed.description,
                                episodes = feed.episodes,
                                artworkUrl = feed.artworkUrl,
                            )
                        )
                        emit(PodcastDetailResult.SetFollowing(following))
                        emit(PodcastDetailResult.QueuedGuidsLoaded(queuedGuids))
                        emit(PodcastDetailResult.UserTierLoaded(tier))
                        emit(PodcastDetailResult.SetError(null))
                    } catch (e: Exception) {
                        emit(PodcastDetailResult.SetError(e.message ?: "Failed to load podcast"))
                    } finally {
                        emit(PodcastDetailResult.SetLoading(false))
                    }
                }

                is PodcastDetailAction.Follow -> flow {
                    emit(PodcastDetailResult.SetFollowLoading(true))
                    try {
                        val s = state.value
                        subscriptionRepository.follow(
                            feedUrl = feedUrl,
                            title = s.podcastTitle,
                            artworkUrl = s.artworkUrl,
                            collectionId = summaryCache.get(feedUrl)?.id ?: 0L,
                        )
                        emit(PodcastDetailResult.SetFollowing(true))
                    } catch (_: Exception) {
                        // Leave following state unchanged
                    } finally {
                        emit(PodcastDetailResult.SetFollowLoading(false))
                    }
                }

                is PodcastDetailAction.Unfollow -> flow {
                    emit(PodcastDetailResult.SetFollowLoading(true))
                    try {
                        subscriptionRepository.unfollow(feedUrl)
                        emit(PodcastDetailResult.SetFollowing(false))
                    } catch (_: Exception) {
                        // Leave following state unchanged
                    } finally {
                        emit(PodcastDetailResult.SetFollowLoading(false))
                    }
                }

                is PodcastDetailAction.ShowLoginPrompt ->
                    flowOf(PodcastDetailResult.SetShowLoginPrompt(true))

                is PodcastDetailAction.DismissLoginPrompt ->
                    flowOf(PodcastDetailResult.SetShowLoginPrompt(false))

                is PodcastDetailAction.ToggleSort ->
                    flowOf(PodcastDetailResult.SortToggled)

                is PodcastDetailAction.ToggleDescription ->
                    flowOf(PodcastDetailResult.DescriptionToggled)

                is PodcastDetailAction.ChangePage ->
                    flowOf(PodcastDetailResult.PageChanged(action.page))

                is PodcastDetailAction.PlayEpisode -> flow<PodcastDetailResult> {
                    _effects.emit(PodcastDetailEffect.PlayEpisode(action.episode))
                }

                is PodcastDetailAction.PlayLatest -> flow<PodcastDetailResult> {
                    _effects.emit(PodcastDetailEffect.PlayLatest)
                }

                is PodcastDetailAction.NavigateToSignIn -> flow<PodcastDetailResult> {
                    emit(PodcastDetailResult.SetShowLoginPrompt(false))
                    _effects.emit(PodcastDetailEffect.NavigateToSignIn)
                }

                is PodcastDetailAction.NavigateToCreateAccount -> flow<PodcastDetailResult> {
                    emit(PodcastDetailResult.SetShowLoginPrompt(false))
                    _effects.emit(PodcastDetailEffect.NavigateToCreateAccount)
                }

                is PodcastDetailAction.AddEpisodeToQueue -> flow {
                    emit(PodcastDetailResult.EpisodeAddedToQueue(action.episode.guid))
                    try {
                        val s = state.value
                        queueRepository.addEpisode(
                            guid = action.episode.guid,
                            feedUrl = feedUrl,
                            title = action.episode.title,
                            audioUrl = action.episode.audioUrl,
                            durationSeconds = action.episode.duration,
                            pubDate = action.episode.pubDate.ifBlank { null },
                            podcastTitle = s.podcastTitle,
                            artworkUrl = s.artworkUrl.ifBlank { null },
                        )
                        _effects.emit(PodcastDetailEffect.EpisodeQueuedAdded)
                    } catch (_: Exception) {
                        emit(PodcastDetailResult.EpisodeRemovedFromQueue(action.episode.guid))
                    }
                }

                is PodcastDetailAction.RemoveEpisodeFromQueue -> flow {
                    emit(PodcastDetailResult.EpisodeRemovedFromQueue(action.episode.guid))
                    try {
                        queueRepository.removeEpisode(action.episode.guid)
                        _effects.emit(PodcastDetailEffect.EpisodeQueuedRemoved)
                    } catch (_: Exception) {
                        emit(PodcastDetailResult.EpisodeAddedToQueue(action.episode.guid))
                    }
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: PodcastDetailState,
        result: PodcastDetailResult,
    ): PodcastDetailState = when (result) {
        is PodcastDetailResult.HeaderLoaded -> previous.copy(
            podcastTitle = result.title,
            artistName = result.artistName,
            artworkUrl = result.artworkUrl,
            genres = result.genres,
        )

        is PodcastDetailResult.FeedLoaded -> previous.copy(
            description = result.description,
            episodes = result.episodes,
            // Only overwrite artworkUrl from feed if not already set from cache (iTunes CDN preferred)
            artworkUrl = if (previous.artworkUrl.isNotBlank()) previous.artworkUrl else result.artworkUrl,
        )

        is PodcastDetailResult.SetLoading -> previous.copy(isLoading = result.loading)
        is PodcastDetailResult.SetError -> previous.copy(error = result.message)
        is PodcastDetailResult.SetFollowing -> previous.copy(isFollowing = result.following)
        is PodcastDetailResult.SetFollowLoading -> previous.copy(isFollowLoading = result.loading)
        is PodcastDetailResult.SetShowLoginPrompt -> previous.copy(showLoginPrompt = result.show)
        is PodcastDetailResult.SortToggled -> previous.copy(sortNewestFirst = !previous.sortNewestFirst)
        is PodcastDetailResult.DescriptionToggled -> previous.copy(isDescriptionExpanded = !previous.isDescriptionExpanded)
        is PodcastDetailResult.PageChanged -> previous.copy(currentPage = result.page)
        is PodcastDetailResult.QueuedGuidsLoaded -> previous.copy(queuedGuids = result.guids)
        is PodcastDetailResult.EpisodeAddedToQueue -> previous.copy(queuedGuids = previous.queuedGuids + result.guid)
        is PodcastDetailResult.EpisodeRemovedFromQueue -> previous.copy(queuedGuids = previous.queuedGuids - result.guid)
        is PodcastDetailResult.UserTierLoaded -> previous.copy(userTier = result.tier)
    }
}
