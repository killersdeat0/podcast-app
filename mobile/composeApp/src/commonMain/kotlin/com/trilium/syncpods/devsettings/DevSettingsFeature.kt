package com.trilium.syncpods.devsettings

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

data class DevSettingsState(
    val activeEnvironment: Environment = Environment.DEV,
    val selectedEnvironment: Environment = Environment.DEV,
)

sealed class DevSettingsEvent {
    data object ScreenVisible : DevSettingsEvent()
    data class EnvironmentTapped(val environment: Environment) : DevSettingsEvent()
    // Screen reads state.selectedEnvironment and passes it here — keeps eventToAction stateless
    data class SwitchConfirmed(val environment: Environment) : DevSettingsEvent()
}

sealed class DevSettingsAction {
    data object LoadEnvironment : DevSettingsAction()
    data class SelectEnvironment(val environment: Environment) : DevSettingsAction()
    data class CommitAndRestart(val environment: Environment) : DevSettingsAction()
}

sealed class DevSettingsResult {
    data class EnvironmentLoaded(val environment: Environment) : DevSettingsResult()
    data class EnvironmentSelected(val environment: Environment) : DevSettingsResult()
}

sealed class DevSettingsEffect {
    data object RestartApp : DevSettingsEffect()
}

@OptIn(ExperimentalCoroutinesApi::class)
class DevSettingsFeature(
    scope: CoroutineScope,
    private val repository: DevSettingsRepository,
) : StandardFeature<DevSettingsState, DevSettingsEvent, DevSettingsAction, DevSettingsResult, DevSettingsEffect>(scope) {

    private val _effects = MutableSharedFlow<DevSettingsEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<DevSettingsEffect> get() = _effects

    override val initial = DevSettingsState()

    override val eventToAction: Interactor<DevSettingsEvent, DevSettingsAction> = { events ->
        merge(
            events.filterIsInstance<DevSettingsEvent.ScreenVisible>()
                .map { DevSettingsAction.LoadEnvironment },

            events.filterIsInstance<DevSettingsEvent.EnvironmentTapped>()
                .map { DevSettingsAction.SelectEnvironment(it.environment) },

            events.filterIsInstance<DevSettingsEvent.SwitchConfirmed>()
                .map { DevSettingsAction.CommitAndRestart(it.environment) },
        )
    }

    override val actionToResult: Interactor<DevSettingsAction, DevSettingsResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is DevSettingsAction.LoadEnvironment -> flow {
                    emit(DevSettingsResult.EnvironmentLoaded(repository.getActiveEnvironment()))
                }

                is DevSettingsAction.SelectEnvironment ->
                    flowOf(DevSettingsResult.EnvironmentSelected(action.environment))

                is DevSettingsAction.CommitAndRestart -> flow<DevSettingsResult> {
                    repository.saveEnvironment(action.environment)
                    // SharedPreferences.apply() (Android) and NSUserDefaults (iOS) flush async —
                    // wait before killing the process so the disk write completes.
                    delay(300)
                    _effects.emit(DevSettingsEffect.RestartApp)
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: DevSettingsState,
        result: DevSettingsResult,
    ): DevSettingsState = when (result) {
        is DevSettingsResult.EnvironmentLoaded ->
            previous.copy(activeEnvironment = result.environment, selectedEnvironment = result.environment)
        is DevSettingsResult.EnvironmentSelected ->
            previous.copy(selectedEnvironment = result.environment)
    }
}
