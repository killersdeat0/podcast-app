package com.trilium.syncpods.billing

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

const val MONTHLY_PRODUCT_ID = "com.trilium.syncpods.monthly"
const val ANNUAL_PRODUCT_ID = "com.trilium.syncpods.annual"

interface BillingRepository {
    suspend fun getProducts(): List<SubscriptionProduct>
    suspend fun purchase(productId: String): PurchaseResult
    suspend fun restorePurchases(): RestoreResult
}

class BillingRepositoryImpl(
    private val billingHandler: BillingHandler,
    private val supabase: SupabaseClient,
) : BillingRepository {

    override suspend fun getProducts(): List<SubscriptionProduct> =
        billingHandler.getProducts(listOf(MONTHLY_PRODUCT_ID, ANNUAL_PRODUCT_ID))

    override suspend fun purchase(productId: String): PurchaseResult {
        val result = billingHandler.purchase(productId)
        if (result is PurchaseResult.Success) updateTierPaid()
        return result
    }

    override suspend fun restorePurchases(): RestoreResult {
        val result = billingHandler.restorePurchases()
        if (result is RestoreResult.Restored) updateTierPaid()
        return result
    }

    private suspend fun updateTierPaid() {
        val userId = supabase.auth.currentUserOrNull()?.id ?: return
        withContext(NonCancellable) {
            supabase.from("user_profiles")
                .update({ set("tier", "paid") }) {
                    filter { eq("user_id", userId) }
                }
        }
    }
}
