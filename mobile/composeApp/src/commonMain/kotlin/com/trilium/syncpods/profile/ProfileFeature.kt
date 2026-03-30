package com.trilium.syncpods.profile

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

data class ProfileState(
    val isLoading: Boolean = true,
    val isGuest: Boolean = false,
    val displayName: String = "",
    val email: String = "",
    val tier: String = "free",
    val subscriptions: List<SubscriptionSummary> = emptyList(),
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class ProfileEvent {
    data object ScreenVisible : ProfileEvent()
    data object SignInTapped : ProfileEvent()
    data object CreateAccountTapped : ProfileEvent()
    data class SubscriptionTapped(val feedUrl: String) : ProfileEvent()
    data object ViewAllSubscriptionsTapped : ProfileEvent()
    data object UpgradeTapped : ProfileEvent()
    data object SettingsTapped : ProfileEvent()
    data object RetryTapped : ProfileEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class ProfileAction {
    data object LoadProfile : ProfileAction()
    data object NavigateToSignIn : ProfileAction()
    data object NavigateToCreateAccount : ProfileAction()
    data class NavigateToPodcast(val feedUrl: String) : ProfileAction()
    data object NavigateToViewAll : ProfileAction()
    data object ShowUpgrade : ProfileAction()
    data object NavigateToSettings : ProfileAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class ProfileResult {
    data object Loading : ProfileResult()
    data object GuestLoaded : ProfileResult()
    data class ProfileLoaded(
        val displayName: String,
        val email: String,
        val tier: String,
        val subscriptions: List<SubscriptionSummary>,
    ) : ProfileResult()
    data class LoadError(val message: String) : ProfileResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class ProfileEffect {
    data object NavigateToSignIn : ProfileEffect()
    data object NavigateToCreateAccount : ProfileEffect()
    data class NavigateToPodcastDetail(val feedUrl: String) : ProfileEffect()
    data object NavigateToSettings : ProfileEffect()
    data object ShowUpgradeSheet : ProfileEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileFeature(
    scope: CoroutineScope,
    private val repository: ProfileRepository,
) : StandardFeature<ProfileState, ProfileEvent, ProfileAction, ProfileResult, ProfileEffect>(scope) {

    private val _effects = MutableSharedFlow<ProfileEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<ProfileEffect> get() = _effects

    override val initial = ProfileState()

    override val eventToAction: Interactor<ProfileEvent, ProfileAction> = { events ->
        merge(
            events.filterIsInstance<ProfileEvent.ScreenVisible>()
                .map { ProfileAction.LoadProfile },

            events.filterIsInstance<ProfileEvent.RetryTapped>()
                .map { ProfileAction.LoadProfile },

            events.filterIsInstance<ProfileEvent.SignInTapped>()
                .map { ProfileAction.NavigateToSignIn },

            events.filterIsInstance<ProfileEvent.CreateAccountTapped>()
                .map { ProfileAction.NavigateToCreateAccount },

            events.filterIsInstance<ProfileEvent.SubscriptionTapped>()
                .map { ProfileAction.NavigateToPodcast(it.feedUrl) },

            events.filterIsInstance<ProfileEvent.ViewAllSubscriptionsTapped>()
                .map { ProfileAction.NavigateToViewAll },

            events.filterIsInstance<ProfileEvent.UpgradeTapped>()
                .map { ProfileAction.ShowUpgrade },

            events.filterIsInstance<ProfileEvent.SettingsTapped>()
                .map { ProfileAction.NavigateToSettings },
        )
    }

    override val actionToResult: Interactor<ProfileAction, ProfileResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is ProfileAction.LoadProfile -> flow {
                    emit(ProfileResult.Loading)
                    try {
                        if (repository.isGuest()) {
                            emit(ProfileResult.GuestLoaded)
                        } else {
                            val profile = repository.getUserProfile()
                            val subscriptions = repository.getSubscriptions()
                            emit(
                                ProfileResult.ProfileLoaded(
                                    displayName = profile.displayName,
                                    email = profile.email,
                                    tier = profile.tier,
                                    subscriptions = subscriptions,
                                )
                            )
                        }
                    } catch (e: Exception) {
                        emit(ProfileResult.LoadError(e.message ?: "Failed to load profile"))
                    }
                }

                is ProfileAction.NavigateToSignIn -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToSignIn)
                }

                is ProfileAction.NavigateToCreateAccount -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToCreateAccount)
                }

                is ProfileAction.NavigateToPodcast -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToPodcastDetail(action.feedUrl))
                }

                is ProfileAction.NavigateToViewAll -> flow<ProfileResult> {
                    // stub — Library screen not yet implemented
                }

                is ProfileAction.ShowUpgrade -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.ShowUpgradeSheet)
                }

                is ProfileAction.NavigateToSettings -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToSettings)
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: ProfileState,
        result: ProfileResult,
    ): ProfileState = when (result) {
        is ProfileResult.Loading -> previous.copy(isLoading = true, error = null)

        is ProfileResult.GuestLoaded -> previous.copy(
            isLoading = false,
            isGuest = true,
            error = null,
        )

        is ProfileResult.ProfileLoaded -> previous.copy(
            isLoading = false,
            isGuest = false,
            displayName = result.displayName,
            email = result.email,
            tier = result.tier,
            subscriptions = result.subscriptions,
            error = null,
        )

        is ProfileResult.LoadError -> previous.copy(isLoading = false, error = result.message)
    }
}
