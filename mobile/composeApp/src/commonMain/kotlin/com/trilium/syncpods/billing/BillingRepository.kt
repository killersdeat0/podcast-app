package com.trilium.syncpods.billing

const val MONTHLY_PRODUCT_ID = "com.trilium.syncpods.monthly"
const val ANNUAL_PRODUCT_ID = "com.trilium.syncpods.annual"

interface BillingRepository {
    suspend fun getProducts(): List<SubscriptionProduct>
    suspend fun purchase(productId: String): PurchaseResult
    suspend fun restorePurchases(): RestoreResult
}
