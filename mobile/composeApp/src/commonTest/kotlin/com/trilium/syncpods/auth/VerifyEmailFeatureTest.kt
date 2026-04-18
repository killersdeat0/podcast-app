package com.trilium.syncpods.auth

import app.cash.turbine.test
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class FakeLoginRepository(
    var shouldThrowOnResend: Boolean = false,
) : LoginRepository {
    var resendCallCount = 0
    override suspend fun signIn(email: String, password: String) = Unit
    override suspend fun signUp(email: String, password: String) = Unit
    override suspend fun sendPasswordResetEmail(email: String) = Unit
    override suspend fun resendVerificationEmail(email: String) {
        resendCallCount++
        if (shouldThrowOnResend) error("resend failed")
    }
    override fun hasActiveSession(): Boolean = false
}

class VerifyEmailFeatureTest {

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `emits NavigateToHome effect when auth signal fires`() = runTest(UnconfinedTestDispatcher()) {
        val authSignal = MutableSharedFlow<Unit>()
        val feature = VerifyEmailFeature(
            featureScope = backgroundScope,
            repository = FakeLoginRepository(),
            email = "user@example.com",
            authSessionFlow = authSignal,
        )

        feature.effects.test {
            authSignal.emit(Unit)
            assertIs<VerifyEmailEffect.NavigateToHome>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `does not emit NavigateToHome before auth signal fires`() = runTest {
        val authSignal = MutableSharedFlow<Unit>()
        val feature = VerifyEmailFeature(
            featureScope = backgroundScope,
            repository = FakeLoginRepository(),
            email = "user@example.com",
            authSessionFlow = authSignal,
        )

        feature.effects.test {
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `initial state contains provided email`() = runTest {
        val feature = VerifyEmailFeature(
            featureScope = backgroundScope,
            repository = FakeLoginRepository(),
            email = "user@example.com",
            authSessionFlow = MutableSharedFlow(),
        )

        assertEquals("user@example.com", feature.state.value.email)
    }

    @Test
    fun `ResendTapped shows success on resend`() = runTest {
        val feature = VerifyEmailFeature(
            featureScope = backgroundScope,
            repository = FakeLoginRepository(),
            email = "user@example.com",
            authSessionFlow = MutableSharedFlow(),
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(VerifyEmailEvent.ResendTapped)

            var latest = awaitItem()
            while (latest.isResending) latest = awaitItem()

            assertTrue(latest.resendSuccess)
            assertNull(latest.error)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `ResendTapped shows error when resend throws`() = runTest {
        val feature = VerifyEmailFeature(
            featureScope = backgroundScope,
            repository = FakeLoginRepository(shouldThrowOnResend = true),
            email = "user@example.com",
            authSessionFlow = MutableSharedFlow(),
        )

        feature.state.test {
            awaitItem() // initial

            feature.process(VerifyEmailEvent.ResendTapped)

            var latest = awaitItem()
            while (latest.isResending) latest = awaitItem()

            assertTrue(latest.error != null)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `BackTapped emits NavigateBack effect`() = runTest {
        val feature = VerifyEmailFeature(
            featureScope = backgroundScope,
            repository = FakeLoginRepository(),
            email = "user@example.com",
            authSessionFlow = MutableSharedFlow(),
        )

        feature.effects.test {
            feature.process(VerifyEmailEvent.BackTapped)
            assertIs<VerifyEmailEffect.NavigateBack>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
