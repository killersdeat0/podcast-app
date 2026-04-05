package com.trilium.syncpods.auth

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch

// ── State ─────────────────────────────────────────────────────────────────────

data class VerifyEmailState(
    val email: String = "",
    val isResending: Boolean = false,
    val resendSuccess: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class VerifyEmailEvent {
    data object ResendTapped : VerifyEmailEvent()
    data object BackTapped : VerifyEmailEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class VerifyEmailAction {
    data object AttemptResend : VerifyEmailAction()
    data object NavigateBack : VerifyEmailAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class VerifyEmailResult {
    data object ResendStarted : VerifyEmailResult()
    data object ResendSucceeded : VerifyEmailResult()
    data class ResendFailed(val message: String) : VerifyEmailResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class VerifyEmailEffect {
    data object NavigateToHome : VerifyEmailEffect()
    data object NavigateBack : VerifyEmailEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class VerifyEmailFeature(
    private val featureScope: CoroutineScope,
    private val repository: LoginRepository,
    email: String,
    authSessionFlow: Flow<Unit>,
) : StandardFeature<VerifyEmailState, VerifyEmailEvent, VerifyEmailAction, VerifyEmailResult, VerifyEmailEffect>(featureScope) {

    private val _effects = MutableSharedFlow<VerifyEmailEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<VerifyEmailEffect> get() = _effects

    override val initial = VerifyEmailState(email = email)

    init {
        featureScope.launch {
            authSessionFlow.first()
            _effects.emit(VerifyEmailEffect.NavigateToHome)
        }
    }

    override val eventToAction: Interactor<VerifyEmailEvent, VerifyEmailAction> = { events ->
        merge(
            events.filterIsInstance<VerifyEmailEvent.ResendTapped>()
                .map { VerifyEmailAction.AttemptResend },

            events.filterIsInstance<VerifyEmailEvent.BackTapped>()
                .map { VerifyEmailAction.NavigateBack },
        )
    }

    override val actionToResult: Interactor<VerifyEmailAction, VerifyEmailResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is VerifyEmailAction.AttemptResend -> flow {
                    val email = state.value.email
                    if (email.isBlank()) return@flow

                    emit(VerifyEmailResult.ResendStarted)
                    try {
                        repository.resendVerificationEmail(email)
                        emit(VerifyEmailResult.ResendSucceeded)
                    } catch (e: Exception) {
                        emit(VerifyEmailResult.ResendFailed("Failed to resend email. Please try again."))
                    }
                }

                is VerifyEmailAction.NavigateBack -> flow<VerifyEmailResult> {
                    _effects.emit(VerifyEmailEffect.NavigateBack)
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: VerifyEmailState,
        result: VerifyEmailResult,
    ): VerifyEmailState = when (result) {
        is VerifyEmailResult.ResendStarted -> previous.copy(isResending = true, resendSuccess = false, error = null)
        is VerifyEmailResult.ResendSucceeded -> previous.copy(isResending = false, resendSuccess = true)
        is VerifyEmailResult.ResendFailed -> previous.copy(isResending = false, error = result.message)
    }
}
