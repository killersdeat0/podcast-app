package com.trilium.syncpods.devsettings

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

private class FakeDevSettingsRepository(
    private var stored: Environment = Environment.DEV,
) : DevSettingsRepository {
    override fun getActiveEnvironment(): Environment = stored
    override fun saveEnvironment(environment: Environment) { stored = environment }
}

class DevSettingsFeatureTest {

    @Test
    fun `ScreenVisible loads active environment into state`() = runTest {
        val repo = FakeDevSettingsRepository(stored = Environment.PROD)
        val feature = DevSettingsFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial DevSettingsState()
            feature.process(DevSettingsEvent.ScreenVisible)
            val loaded = awaitItem()
            assertEquals(Environment.PROD, loaded.activeEnvironment)
            assertEquals(Environment.PROD, loaded.selectedEnvironment)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `EnvironmentTapped updates selectedEnvironment but not activeEnvironment`() = runTest {
        val repo = FakeDevSettingsRepository(stored = Environment.PROD)
        val feature = DevSettingsFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial
            feature.process(DevSettingsEvent.ScreenVisible)
            val loaded = awaitItem() // loaded: activeEnvironment=PROD, selectedEnvironment=PROD
            assertEquals(Environment.PROD, loaded.activeEnvironment)
            assertEquals(Environment.PROD, loaded.selectedEnvironment)

            feature.process(DevSettingsEvent.EnvironmentTapped(Environment.DEV))
            val selected = awaitItem()
            assertEquals(Environment.PROD, selected.activeEnvironment)
            assertEquals(Environment.DEV, selected.selectedEnvironment)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SwitchConfirmed saves environment and emits RestartApp effect`() = runTest {
        val repo = FakeDevSettingsRepository(stored = Environment.DEV)
        val feature = DevSettingsFeature(backgroundScope, repo)

        feature.effects.test {
            feature.process(DevSettingsEvent.ScreenVisible)
            feature.process(DevSettingsEvent.SwitchConfirmed(Environment.PROD))
            assertEquals(DevSettingsEffect.RestartApp, awaitItem())
            assertEquals(Environment.PROD, repo.getActiveEnvironment())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
