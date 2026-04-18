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

data class SignUpState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class SignUpEvent {
    data class EmailChanged(val value: String) : SignUpEvent()
    data class PasswordChanged(val value: String) : SignUpEvent()
    data class ConfirmPasswordChanged(val value: String) : SignUpEvent()
    data object SignUpTapped : SignUpEvent()
    data object BackTapped : SignUpEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class SignUpAction {
    data class UpdateEmail(val value: String) : SignUpAction()
    data class UpdatePassword(val value: String) : SignUpAction()
    data class UpdateConfirmPassword(val value: String) : SignUpAction()
    data object AttemptSignUp : SignUpAction()
    data object NavigateBack : SignUpAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class SignUpResult {
    data class EmailUpdated(val value: String) : SignUpResult()
    data class PasswordUpdated(val value: String) : SignUpResult()
    data class ConfirmPasswordUpdated(val value: String) : SignUpResult()
    data object SignUpStarted : SignUpResult()
    data class SignUpFailed(val message: String) : SignUpResult()
    data object SignUpSucceeded : SignUpResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class SignUpEffect {
    data class NavigateToVerifyEmail(val email: String) : SignUpEffect()
    data object NavigateBack : SignUpEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class SignUpFeature(
    scope: CoroutineScope,
    private val repository: LoginRepository,
) : StandardFeature<SignUpState, SignUpEvent, SignUpAction, SignUpResult, SignUpEffect>(scope) {

    private val _effects = MutableSharedFlow<SignUpEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<SignUpEffect> get() = _effects

    override val initial = SignUpState()

    override val eventToAction: Interactor<SignUpEvent, SignUpAction> = { events ->
        merge(
            events.filterIsInstance<SignUpEvent.EmailChanged>()
                .map { SignUpAction.UpdateEmail(it.value) },

            events.filterIsInstance<SignUpEvent.PasswordChanged>()
                .map { SignUpAction.UpdatePassword(it.value) },

            events.filterIsInstance<SignUpEvent.ConfirmPasswordChanged>()
                .map { SignUpAction.UpdateConfirmPassword(it.value) },

            events.filterIsInstance<SignUpEvent.SignUpTapped>()
                .map { SignUpAction.AttemptSignUp },

            events.filterIsInstance<SignUpEvent.BackTapped>()
                .map { SignUpAction.NavigateBack },
        )
    }

    override val actionToResult: Interactor<SignUpAction, SignUpResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is SignUpAction.UpdateEmail -> flow {
                    emit(SignUpResult.EmailUpdated(action.value))
                }

                is SignUpAction.UpdatePassword -> flow {
                    emit(SignUpResult.PasswordUpdated(action.value))
                }

                is SignUpAction.UpdateConfirmPassword -> flow {
                    emit(SignUpResult.ConfirmPasswordUpdated(action.value))
                }

                is SignUpAction.AttemptSignUp -> flow {
                    val email = state.value.email.trim()
                    val password = state.value.password
                    val confirmPassword = state.value.confirmPassword

                    if (email.isBlank() || password.isBlank()) {
                        emit(SignUpResult.SignUpFailed("Please fill in all fields."))
                        return@flow
                    }

                    if (password.length < 8) {
                        emit(SignUpResult.SignUpFailed("Password must be at least 8 characters."))
                        return@flow
                    }

                    if (password != confirmPassword) {
                        emit(SignUpResult.SignUpFailed("Passwords don't match."))
                        return@flow
                    }

                    emit(SignUpResult.SignUpStarted)
                    try {
                        repository.signUp(email, password)
                        emit(SignUpResult.SignUpSucceeded)
                        if (repository.hasActiveSession()) {
                            _effects.emit(SignUpEffect.NavigateBack)
                        } else {
                            _effects.emit(SignUpEffect.NavigateToVerifyEmail(email))
                        }
                    } catch (e: Exception) {
                        println("SignUp error: ${e::class.simpleName} — ${e.message}")
                        val message = when {
                            e.message?.contains("already registered", ignoreCase = true) == true ->
                                "An account with this email already exists."
                            else -> "Sign up failed. Please try again."
                        }
                        emit(SignUpResult.SignUpFailed(message))
                    }
                }

                is SignUpAction.NavigateBack -> flow<SignUpResult> {
                    _effects.emit(SignUpEffect.NavigateBack)
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: SignUpState,
        result: SignUpResult,
    ): SignUpState = when (result) {
        is SignUpResult.EmailUpdated -> previous.copy(email = result.value, error = null)
        is SignUpResult.PasswordUpdated -> previous.copy(password = result.value, error = null)
        is SignUpResult.ConfirmPasswordUpdated -> previous.copy(confirmPassword = result.value, error = null)
        is SignUpResult.SignUpStarted -> previous.copy(isLoading = true, error = null)
        is SignUpResult.SignUpFailed -> previous.copy(isLoading = false, error = result.message)
        is SignUpResult.SignUpSucceeded -> previous.copy(isLoading = false, error = null)
    }
}
