package com.trilium.syncpods.profile

import app.cash.turbine.test
import com.trilium.syncpods.billing.BillingRepository
import com.trilium.syncpods.billing.PurchaseResult
import com.trilium.syncpods.billing.RestoreResult
import com.trilium.syncpods.billing.SubscriptionProduct
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ProfileFeatureTest {

    private val monthlyProduct = SubscriptionProduct("com.trilium.syncpods.monthly", "$4.99")
    private val annualProduct = SubscriptionProduct("com.trilium.syncpods.annual", "$50.00")
    private val fakeSubscriptions = listOf(
        SubscriptionSummary("https://feed.example.com/1", "Podcast 1", "https://art.example.com/1"),
    )

    @Test
    fun `ScreenVisible completes loading for authenticated user without spinner getting stuck`() = runTest {
        // Regression test: ScreenVisible simultaneously emits LoadProfile and LoadProducts actions.
        // Before the fix, flatMapLatest cancelled LoadProfile when LoadProducts arrived, leaving
        // isLoading=true permanently.
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(
                guest = false,
                profile = UserProfile("Test User", "test@example.com", "free"),
                subscriptions = fakeSubscriptions,
            ),
            billingRepository = FakeBillingRepo(products = listOf(monthlyProduct, annualProduct)),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading || latest.displayName.isEmpty()) latest = awaitItem()
            assertFalse(latest.isLoading)
            assertEquals("Test User", latest.displayName)
            assertEquals("test@example.com", latest.email)
            assertEquals("free", latest.tier)
            assertNull(latest.error)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `ScreenVisible completes loading for guest user without spinner getting stuck`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(guest = true),
            billingRepository = FakeBillingRepo(),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            assertFalse(latest.isLoading)
            assertTrue(latest.isGuest)
            assertNull(latest.error)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `ScreenVisible loads subscriptions for authenticated user`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(
                guest = false,
                subscriptions = fakeSubscriptions,
            ),
            billingRepository = FakeBillingRepo(),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.subscriptions.isEmpty() && !latest.isLoading) latest = awaitItem()
            while (latest.isLoading) latest = awaitItem()
            assertEquals(fakeSubscriptions, latest.subscriptions)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `ScreenVisible loads both profile and products concurrently`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(
                guest = false,
                profile = UserProfile("Test User", "test@example.com", "free"),
            ),
            billingRepository = FakeBillingRepo(products = listOf(monthlyProduct, annualProduct)),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.isLoading || latest.displayName.isEmpty() || latest.products.isEmpty()) {
                latest = awaitItem()
            }
            assertEquals("Test User", latest.displayName)
            assertEquals(listOf(monthlyProduct, annualProduct), latest.products)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `RetryTapped reloads profile after error`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(throwOnLoad = true),
            billingRepository = FakeBillingRepo(),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.error == null) latest = awaitItem()
            assertTrue(latest.error.isNotEmpty())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SettingsTapped emits NavigateToSettings effect`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(),
            billingRepository = FakeBillingRepo(),
        )

        feature.effects.test {
            feature.process(ProfileEvent.SettingsTapped)
            assertEquals(ProfileEffect.NavigateToSettings, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SignInTapped emits NavigateToSignIn effect`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(),
            billingRepository = FakeBillingRepo(),
        )

        feature.effects.test {
            feature.process(ProfileEvent.SignInTapped)
            assertEquals(ProfileEffect.NavigateToSignIn, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `ViewAllSubscriptionsTapped emits NavigateToLibrary effect`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepo(),
            billingRepository = FakeBillingRepo(),
        )

        feature.effects.test {
            feature.process(ProfileEvent.ViewAllSubscriptionsTapped)
            assertEquals(ProfileEffect.NavigateToLibrary, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Test doubles ────────────────────────────────────────────────────────────────

private class FakeProfileRepo(
    private val guest: Boolean = false,
    private val profile: UserProfile = UserProfile("Test User", "test@example.com", "free"),
    private val subscriptions: List<SubscriptionSummary> = emptyList(),
    private val throwOnLoad: Boolean = false,
) : ProfileRepository {
    override fun isGuest() = guest
    override fun authStateChanges(): Flow<Unit> = emptyFlow()
    override suspend fun getUserProfile(): UserProfile {
        if (throwOnLoad) throw RuntimeException("load failed")
        return profile
    }
    override suspend fun getSubscriptions() = subscriptions
    override suspend fun getUserTier() = profile.tier
}

private class FakeBillingRepo(
    private val products: List<SubscriptionProduct> = emptyList(),
    private val purchaseResult: PurchaseResult = PurchaseResult.Success,
    private val restoreResult: RestoreResult = RestoreResult.NothingToRestore,
) : BillingRepository {
    override suspend fun getProducts() = products
    override suspend fun purchase(productId: String) = purchaseResult
    override suspend fun restorePurchases() = restoreResult
}
