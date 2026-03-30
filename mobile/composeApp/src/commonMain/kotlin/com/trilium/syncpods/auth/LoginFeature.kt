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

data class LoginState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class LoginEvent {
    data class EmailChanged(val value: String) : LoginEvent()
    data class PasswordChanged(val value: String) : LoginEvent()
    data object SignInTapped : LoginEvent()
    data object BackTapped : LoginEvent()
    data class GoogleSignInFailed(val message: String) : LoginEvent()
    data object GoogleSignInDismissed : LoginEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class LoginAction {
    data class UpdateEmail(val value: String) : LoginAction()
    data class UpdatePassword(val value: String) : LoginAction()
    data object AttemptSignIn : LoginAction()
    data object NavigateBack : LoginAction()
    data class SetError(val message: String) : LoginAction()
    data object GoogleSignInUnavailable : LoginAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class LoginResult {
    data class EmailUpdated(val value: String) : LoginResult()
    data class PasswordUpdated(val value: String) : LoginResult()
    data object SignInStarted : LoginResult()
    data class SignInFailed(val message: String) : LoginResult()
    data object SignInSucceeded : LoginResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class LoginEffect {
    data object NavigateBack : LoginEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class LoginFeature(
    scope: CoroutineScope,
    private val repository: LoginRepository,
) : StandardFeature<LoginState, LoginEvent, LoginAction, LoginResult, LoginEffect>(scope) {

    private val _effects = MutableSharedFlow<LoginEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<LoginEffect> get() = _effects

    override val initial = LoginState()

    override val eventToAction: Interactor<LoginEvent, LoginAction> = { events ->
        merge(
            events.filterIsInstance<LoginEvent.EmailChanged>()
                .map { LoginAction.UpdateEmail(it.value) },

            events.filterIsInstance<LoginEvent.PasswordChanged>()
                .map { LoginAction.UpdatePassword(it.value) },

            events.filterIsInstance<LoginEvent.SignInTapped>()
                .map { LoginAction.AttemptSignIn },

            events.filterIsInstance<LoginEvent.BackTapped>()
                .map { LoginAction.NavigateBack },

            events.filterIsInstance<LoginEvent.GoogleSignInFailed>()
                .map { LoginAction.SetError(it.message) },

            events.filterIsInstance<LoginEvent.GoogleSignInDismissed>()
                .map { LoginAction.GoogleSignInUnavailable },
        )
    }

    override val actionToResult: Interactor<LoginAction, LoginResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is LoginAction.UpdateEmail -> flow {
                    emit(LoginResult.EmailUpdated(action.value))
                }

                is LoginAction.UpdatePassword -> flow {
                    emit(LoginResult.PasswordUpdated(action.value))
                }

                is LoginAction.AttemptSignIn -> flow {
                    val email = state.value.email.trim()
                    val password = state.value.password

                    if (email.isBlank() || password.isBlank()) {
                        emit(LoginResult.SignInFailed("Please enter your email and password."))
                        return@flow
                    }

                    emit(LoginResult.SignInStarted)
                    try {
                        repository.signIn(email, password)
                        emit(LoginResult.SignInSucceeded)
                        _effects.emit(LoginEffect.NavigateBack)
                    } catch (e: Exception) {
                        emit(LoginResult.SignInFailed("Sign in failed. Please check your credentials and try again."))
                    }
                }

                is LoginAction.NavigateBack -> flow<LoginResult> {
                    _effects.emit(LoginEffect.NavigateBack)
                }

                is LoginAction.SetError -> flow {
                    emit(LoginResult.SignInFailed(action.message))
                }

                is LoginAction.GoogleSignInUnavailable -> flow {
                    emit(LoginResult.SignInFailed("Google sign-in unavailable. Make sure a Google account is added to your device settings."))
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: LoginState,
        result: LoginResult,
    ): LoginState = when (result) {
        is LoginResult.EmailUpdated -> previous.copy(email = result.value, error = null)

        is LoginResult.PasswordUpdated -> previous.copy(password = result.value, error = null)

        is LoginResult.SignInStarted -> previous.copy(isLoading = true, error = null)

        is LoginResult.SignInFailed -> previous.copy(isLoading = false, error = result.message)

        is LoginResult.SignInSucceeded -> previous.copy(isLoading = false, error = null)
    }
}
