package com.trilium.syncpods.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.lang.ref.WeakReference
import kotlin.coroutines.resume

class AndroidBillingHandler(context: Context) : BillingHandler {

    private var activityRef: WeakReference<Activity> = WeakReference(null)
    private var pendingPurchaseDeferred: CompletableDeferred<PurchaseResult>? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener { billingResult, purchases ->
            val deferred = pendingPurchaseDeferred ?: return@setListener
            pendingPurchaseDeferred = null
            when {
                billingResult.responseCode == BillingClient.BillingResponseCode.OK
                        && !purchases.isNullOrEmpty() -> {
                    val purchase = purchases.first()
                    if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                        scope.launch {
                            acknowledgePurchase(purchase)
                            deferred.complete(PurchaseResult.Success)
                        }
                    }
                }
                billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED ->
                    deferred.complete(PurchaseResult.Cancelled)
                else ->
                    deferred.complete(PurchaseResult.Error(billingResult.debugMessage))
            }
        }
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    fun onActivityResumed(activity: Activity) {
        activityRef = WeakReference(activity)
    }

    fun onActivityPaused() {
        activityRef = WeakReference(null)
    }

    override suspend fun getProducts(productIds: List<String>): List<SubscriptionProduct> {
        ensureConnected()
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                productIds.map { id ->
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(id)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                }
            )
            .build()
        return suspendCancellableCoroutine { cont ->
            billingClient.queryProductDetailsAsync(params) { result, list ->
                cont.resume(
                    if (result.responseCode == BillingClient.BillingResponseCode.OK)
                        list.map { it.toSubscriptionProduct() }
                    else emptyList()
                )
            }
        }
    }

    override suspend fun purchase(productId: String): PurchaseResult {
        val activity = activityRef.get()
            ?: return PurchaseResult.Error("No active Activity — cannot launch billing flow")
        if (pendingPurchaseDeferred?.isActive == true) {
            return PurchaseResult.Error("A purchase is already in progress")
        }
        ensureConnected()

        val productDetails = queryProductDetails(productId)
            ?: return PurchaseResult.Error("Product not found: $productId")

        val offerToken = productDetails.subscriptionOfferDetails
            ?.firstOrNull()?.offerToken
            ?: return PurchaseResult.Error("No subscription offer available for $productId")

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(productDetails)
                        .setOfferToken(offerToken)
                        .build()
                )
            )
            .build()

        pendingPurchaseDeferred = CompletableDeferred()
        billingClient.launchBillingFlow(activity, billingFlowParams)
        return pendingPurchaseDeferred!!.await()
    }

    override suspend fun restorePurchases(): RestoreResult {
        ensureConnected()
        val result = suspendCancellableCoroutine { cont ->
            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            ) { result, purchases ->
                when {
                    result.responseCode != BillingClient.BillingResponseCode.OK ->
                        cont.resume(Pair(RestoreResult.Error(result.debugMessage), emptyList<Purchase>()))
                    purchases.any { it.purchaseState == Purchase.PurchaseState.PURCHASED } ->
                        cont.resume(Pair(RestoreResult.Restored, purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }))
                    else -> cont.resume(Pair(RestoreResult.NothingToRestore, emptyList()))
                }
            }
        }
        result.second.forEach { acknowledgePurchase(it) }
        return result.first
    }

    private suspend fun queryProductDetails(productId: String): ProductDetails? =
        suspendCancellableCoroutine { cont ->
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()
                    )
                )
                .build()
            billingClient.queryProductDetailsAsync(params) { result, list ->
                cont.resume(
                    if (result.responseCode == BillingClient.BillingResponseCode.OK)
                        list.firstOrNull() else null
                )
            }
        }

    private suspend fun acknowledgePurchase(purchase: Purchase) {
        if (purchase.isAcknowledged) return
        suspendCancellableCoroutine { cont ->
            billingClient.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build()
            ) { cont.resume(Unit) }
        }
    }

    private suspend fun ensureConnected() {
        if (billingClient.isReady) return
        suspendCancellableCoroutine { cont ->
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) { cont.resume(Unit) }
                override fun onBillingServiceDisconnected() {
                    cont.cancel(Exception("Billing service disconnected"))
                }
            })
        }
    }

    private fun ProductDetails.toSubscriptionProduct() = SubscriptionProduct(
        id = productId,
        displayPrice = subscriptionOfferDetails
            ?.firstOrNull()
            ?.pricingPhases
            ?.pricingPhaseList
            ?.firstOrNull()
            ?.formattedPrice ?: "",
    )
}
