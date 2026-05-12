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
