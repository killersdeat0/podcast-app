package com.trilium.syncpods.settings

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertIs

private class FakeSettingsRepository(
    private val signedIn: Boolean = true,
) : SettingsRepository {
    override fun isSignedIn(): Boolean = signedIn
    override suspend fun signOut() {}
}

class SettingsFeatureTest {

    @Test
    fun `DeleteAccountTapped emits OpenDeleteAccountPage effect`() = runTest {
        val feature = SettingsFeature(backgroundScope, FakeSettingsRepository())

        feature.effects.test {
            feature.process(SettingsEvent.DeleteAccountTapped)
            assertIs<SettingsEffect.OpenDeleteAccountPage>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
