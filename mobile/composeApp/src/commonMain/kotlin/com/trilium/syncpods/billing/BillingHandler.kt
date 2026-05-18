package com.trilium.syncpods.billing

interface BillingHandler {
    suspend fun getProducts(productIds: List<String>): List<SubscriptionProduct>
    suspend fun purchase(productId: String): PurchaseResult
    suspend fun restorePurchases(): RestoreResult
}

data class SubscriptionProduct(val id: String, val displayPrice: String)

sealed class PurchaseResult {
    data object Success : PurchaseResult()
    data object Cancelled : PurchaseResult()
    data class Error(val message: String) : PurchaseResult()
}

sealed class RestoreResult {
    data object Restored : RestoreResult()
    data object NothingToRestore : RestoreResult()
    data class Error(val message: String) : RestoreResult()
}
