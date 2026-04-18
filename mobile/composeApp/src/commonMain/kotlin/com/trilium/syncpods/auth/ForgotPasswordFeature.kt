package com.trilium.syncpods.auth

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

data class ForgotPasswordState(
    val email: String = "",
    val isLoading: Boolean = false,
    val isEmailSent: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class ForgotPasswordEvent {
    data class EmailChanged(val value: String) : ForgotPasswordEvent()
    data object SubmitTapped : ForgotPasswordEvent()
    data object BackTapped : ForgotPasswordEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class ForgotPasswordAction {
    data class UpdateEmail(val value: String) : ForgotPasswordAction()
    data object AttemptSend : ForgotPasswordAction()
    data object NavigateBack : ForgotPasswordAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class ForgotPasswordResult {
    data class EmailUpdated(val value: String) : ForgotPasswordResult()
    data object SendStarted : ForgotPasswordResult()
    data object SendSucceeded : ForgotPasswordResult()
    data class SendFailed(val message: String) : ForgotPasswordResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class ForgotPasswordEffect {
    data object NavigateBack : ForgotPasswordEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class ForgotPasswordFeature(
    scope: CoroutineScope,
    private val repository: LoginRepository,
) : StandardFeature<ForgotPasswordState, ForgotPasswordEvent, ForgotPasswordAction, ForgotPasswordResult, ForgotPasswordEffect>(scope) {

    private val _effects = MutableSharedFlow<ForgotPasswordEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<ForgotPasswordEffect> get() = _effects

    override val initial = ForgotPasswordState()

    override val eventToAction: Interactor<ForgotPasswordEvent, ForgotPasswordAction> = { events ->
        merge(
            events.filterIsInstance<ForgotPasswordEvent.EmailChanged>()
                .map { ForgotPasswordAction.UpdateEmail(it.value) },

            events.filterIsInstance<ForgotPasswordEvent.SubmitTapped>()
                .map { ForgotPasswordAction.AttemptSend },

            events.filterIsInstance<ForgotPasswordEvent.BackTapped>()
                .map { ForgotPasswordAction.NavigateBack },
        )
    }

    override val actionToResult: Interactor<ForgotPasswordAction, ForgotPasswordResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is ForgotPasswordAction.UpdateEmail -> flow {
                    emit(ForgotPasswordResult.EmailUpdated(action.value))
                }

                is ForgotPasswordAction.AttemptSend -> flow {
                    val email = state.value.email.trim()
                    if (email.isBlank()) {
                        emit(ForgotPasswordResult.SendFailed("Please enter your email address."))
                        return@flow
                    }

                    emit(ForgotPasswordResult.SendStarted)
                    try {
                        repository.sendPasswordResetEmail(email)
                        emit(ForgotPasswordResult.SendSucceeded)
                    } catch (e: Exception) {
                        emit(ForgotPasswordResult.SendFailed("Failed to send reset email. Please try again."))
                    }
                }

                is ForgotPasswordAction.NavigateBack -> flow<ForgotPasswordResult> {
                    _effects.emit(ForgotPasswordEffect.NavigateBack)
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: ForgotPasswordState,
        result: ForgotPasswordResult,
    ): ForgotPasswordState = when (result) {
        is ForgotPasswordResult.EmailUpdated -> previous.copy(email = result.value, error = null)
        is ForgotPasswordResult.SendStarted -> previous.copy(isLoading = true, error = null)
        is ForgotPasswordResult.SendSucceeded -> previous.copy(isLoading = false, isEmailSent = true)
        is ForgotPasswordResult.SendFailed -> previous.copy(isLoading = false, error = result.message)
    }
}
