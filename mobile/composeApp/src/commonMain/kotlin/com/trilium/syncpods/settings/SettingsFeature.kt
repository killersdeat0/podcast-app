package com.trilium.syncpods.settings

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

data class SettingsState(
    val isSignedIn: Boolean = false,
    val isSigningOut: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class SettingsEvent {
    data object ScreenVisible : SettingsEvent()
    data object SignOutTapped : SettingsEvent()
    data object NotificationsTapped : SettingsEvent()
    data object PlaybackDefaultsTapped : SettingsEvent()
    data object OPMLTapped : SettingsEvent()
    data object ManageSubscriptionTapped : SettingsEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class SettingsAction {
    data object LoadAuthState : SettingsAction()
    data object SignOut : SettingsAction()
    data object NavigateToNotifications : SettingsAction()
    data object NavigateToPlaybackDefaults : SettingsAction()
    data object NavigateToOPML : SettingsAction()
    data object NavigateToManageSubscription : SettingsAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class SettingsResult {
    data class AuthStateLoaded(val isSignedIn: Boolean) : SettingsResult()
    data object SigningOut : SettingsResult()
    data object SignedOut : SettingsResult()
    data class SignOutError(val message: String) : SettingsResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class SettingsEffect {
    data object ShowSignedOutToast : SettingsEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsFeature(
    scope: CoroutineScope,
    private val repository: SettingsRepository,
) : StandardFeature<SettingsState, SettingsEvent, SettingsAction, SettingsResult, SettingsEffect>(scope) {

    private val _effects = MutableSharedFlow<SettingsEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<SettingsEffect> get() = _effects

    override val initial = SettingsState()

    override val eventToAction: Interactor<SettingsEvent, SettingsAction> = { events ->
        merge(
            events.filterIsInstance<SettingsEvent.ScreenVisible>()
                .map { SettingsAction.LoadAuthState },

            events.filterIsInstance<SettingsEvent.SignOutTapped>()
                .map { SettingsAction.SignOut },

            events.filterIsInstance<SettingsEvent.NotificationsTapped>()
                .map { SettingsAction.NavigateToNotifications },

            events.filterIsInstance<SettingsEvent.PlaybackDefaultsTapped>()
                .map { SettingsAction.NavigateToPlaybackDefaults },

            events.filterIsInstance<SettingsEvent.OPMLTapped>()
                .map { SettingsAction.NavigateToOPML },

            events.filterIsInstance<SettingsEvent.ManageSubscriptionTapped>()
                .map { SettingsAction.NavigateToManageSubscription },
        )
    }

    override val actionToResult: Interactor<SettingsAction, SettingsResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is SettingsAction.LoadAuthState -> flow {
                    emit(SettingsResult.AuthStateLoaded(repository.isSignedIn()))
                }

                is SettingsAction.SignOut -> flow {
                    emit(SettingsResult.SigningOut)
                    try {
                        repository.signOut()
                        emit(SettingsResult.SignedOut)
                        _effects.emit(SettingsEffect.ShowSignedOutToast)
                    } catch (e: Exception) {
                        emit(SettingsResult.SignOutError(e.message ?: "Sign out failed"))
                    }
                }

                is SettingsAction.NavigateToNotifications -> flow {}
                is SettingsAction.NavigateToPlaybackDefaults -> flow {}
                is SettingsAction.NavigateToOPML -> flow {}
                is SettingsAction.NavigateToManageSubscription -> flow {}
            }
        }
    }

    override suspend fun handleResult(
        previous: SettingsState,
        result: SettingsResult,
    ): SettingsState = when (result) {
        is SettingsResult.AuthStateLoaded -> previous.copy(isSignedIn = result.isSignedIn)
        is SettingsResult.SigningOut -> previous.copy(isSigningOut = true, error = null)
        is SettingsResult.SignedOut -> previous.copy(isSigningOut = false, isSignedIn = false)
        is SettingsResult.SignOutError -> previous.copy(isSigningOut = false, error = result.message)
    }
}
