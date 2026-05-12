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
import kotlin.test.assertIs

class ProfileFeatureSubscriptionTest {

    private val monthlyProduct = SubscriptionProduct("com.trilium.syncpods.monthly", "$4.99")
    private val annualProduct = SubscriptionProduct("com.trilium.syncpods.annual", "$50.00")

    @Test
    fun `ScreenVisible loads products into state`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(),
            billingRepository = FakeBillingRepository(
                products = listOf(monthlyProduct, annualProduct)
            ),
        )

        feature.state.test {
            awaitItem() // initial ProfileState()
            feature.process(ProfileEvent.ScreenVisible)
            var latest = awaitItem()
            while (latest.products.isEmpty()) latest = awaitItem()
            assertEquals(listOf(monthlyProduct, annualProduct), latest.products)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SubscribeMonthlyTapped on success emits ShowPurchaseSuccess effect`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(),
            billingRepository = FakeBillingRepository(purchaseResult = PurchaseResult.Success),
        )

        feature.effects.test {
            feature.process(ProfileEvent.SubscribeMonthlyTapped)
            assertIs<ProfileEffect.ShowPurchaseSuccess>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SubscribeMonthlyTapped on success sets tier to paid in state`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(profile = UserProfile("User", "u@e.com", "free")),
            billingRepository = FakeBillingRepository(purchaseResult = PurchaseResult.Success),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.SubscribeMonthlyTapped)
            var latest = awaitItem()
            while (latest.tier != "paid") latest = awaitItem()
            assertEquals("paid", latest.tier)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SubscribeMonthlyTapped on cancelled resets isPurchasing without changing tier`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(profile = UserProfile("User", "u@e.com", "free")),
            billingRepository = FakeBillingRepository(purchaseResult = PurchaseResult.Cancelled),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.SubscribeMonthlyTapped)
            var latest = awaitItem()
            while (latest.isPurchasing) latest = awaitItem()
            assertEquals("free", latest.tier)
            assertFalse(latest.isPurchasing)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SubscribeMonthlyTapped on error emits ShowPurchaseError with message`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(),
            billingRepository = FakeBillingRepository(
                purchaseResult = PurchaseResult.Error("billing unavailable")
            ),
        )

        feature.effects.test {
            feature.process(ProfileEvent.SubscribeMonthlyTapped)
            val effect = awaitItem()
            assertIs<ProfileEffect.ShowPurchaseError>(effect)
            assertEquals("billing unavailable", effect.message)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SubscribeAnnuallyTapped on success sets tier to paid`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(profile = UserProfile("User", "u@e.com", "free")),
            billingRepository = FakeBillingRepository(purchaseResult = PurchaseResult.Success),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.SubscribeAnnuallyTapped)
            var latest = awaitItem()
            while (latest.tier != "paid") latest = awaitItem()
            assertEquals("paid", latest.tier)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SubscribeAnnuallyTapped on cancelled resets isPurchasing without changing tier`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(profile = UserProfile("User", "u@e.com", "free")),
            billingRepository = FakeBillingRepository(purchaseResult = PurchaseResult.Cancelled),
        )

        feature.state.test {
            awaitItem() // initial
            feature.process(ProfileEvent.SubscribeAnnuallyTapped)
            var latest = awaitItem()
            while (latest.isPurchasing) latest = awaitItem()
            assertEquals("free", latest.tier)
            assertFalse(latest.isPurchasing)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SubscribeAnnuallyTapped on error emits ShowPurchaseError with message`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(),
            billingRepository = FakeBillingRepository(
                purchaseResult = PurchaseResult.Error("annual billing unavailable")
            ),
        )

        feature.effects.test {
            feature.process(ProfileEvent.SubscribeAnnuallyTapped)
            val effect = awaitItem()
            assertIs<ProfileEffect.ShowPurchaseError>(effect)
            assertEquals("annual billing unavailable", effect.message)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `RestorePurchasesTapped on Restored emits ShowRestoreSuccess`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(),
            billingRepository = FakeBillingRepository(restoreResult = RestoreResult.Restored),
        )

        feature.effects.test {
            feature.process(ProfileEvent.RestorePurchasesTapped)
            assertIs<ProfileEffect.ShowRestoreSuccess>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `RestorePurchasesTapped on Restored sets tier to paid`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(profile = UserProfile("User", "u@e.com", "free")),
            billingRepository = FakeBillingRepository(restoreResult = RestoreResult.Restored),
        )

        feature.state.test {
            awaitItem()
            feature.process(ProfileEvent.RestorePurchasesTapped)
            var latest = awaitItem()
            while (latest.tier != "paid") latest = awaitItem()
            assertEquals("paid", latest.tier)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `RestorePurchasesTapped on NothingToRestore emits ShowRestoreNothing`() = runTest {
        val feature = ProfileFeature(
            scope = backgroundScope,
            repository = FakeProfileRepository(),
            billingRepository = FakeBillingRepository(restoreResult = RestoreResult.NothingToRestore),
        )

        feature.effects.test {
            feature.process(ProfileEvent.RestorePurchasesTapped)
            assertIs<ProfileEffect.ShowRestoreNothing>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// ── Test doubles ────────────────────────────────────────────────────────────────

private class FakeProfileRepository(
    private val guest: Boolean = false,
    private val profile: UserProfile = UserProfile("Test User", "test@example.com", "free"),
    private val subscriptions: List<SubscriptionSummary> = emptyList(),
) : ProfileRepository {
    override fun isGuest() = guest
    override fun authStateChanges(): Flow<Unit> = emptyFlow()
    override suspend fun getUserProfile() = profile
    override suspend fun getSubscriptions() = subscriptions
    override suspend fun getUserTier() = profile.tier
}

private class FakeBillingRepository(
    private val products: List<SubscriptionProduct> = emptyList(),
    private val purchaseResult: PurchaseResult = PurchaseResult.Success,
    private val restoreResult: RestoreResult = RestoreResult.NothingToRestore,
) : BillingRepository {
    override suspend fun getProducts() = products
    override suspend fun purchase(productId: String) = purchaseResult
    override suspend fun restorePurchases() = restoreResult
}
