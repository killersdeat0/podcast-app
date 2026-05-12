@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.trilium.syncpods.billing

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.Foundation.NSError
import platform.Foundation.NSNumber
import platform.Foundation.NSNumberFormatter
import platform.Foundation.NSNumberFormatterCurrencyStyle
import platform.StoreKit.SKErrorCode
import platform.StoreKit.SKPayment
import platform.StoreKit.SKPaymentQueue
import platform.StoreKit.SKPaymentTransaction
import platform.StoreKit.SKPaymentTransactionObserverProtocol
import platform.StoreKit.SKPaymentTransactionState
import platform.StoreKit.SKProduct
import platform.StoreKit.SKProductsRequest
import platform.StoreKit.SKProductsRequestDelegateProtocol
import platform.StoreKit.SKProductsResponse
import platform.StoreKit.SKRequest
import platform.darwin.NSObject
import kotlin.coroutines.resume

class IOSBillingHandler : NSObject(), BillingHandler, SKPaymentTransactionObserverProtocol {

    private var pendingPurchaseDeferred: CompletableDeferred<PurchaseResult>? = null
    private var pendingRestoreDeferred: CompletableDeferred<RestoreResult>? = null
    private var restoredCount = 0

    init {
        SKPaymentQueue.defaultQueue().addTransactionObserver(this)
    }

    // ── BillingHandler ────────────────────────────────────────────────────────

    override suspend fun getProducts(productIds: List<String>): List<SubscriptionProduct> =
        suspendCancellableCoroutine { cont ->
            val identifiers = productIds.toSet()
            val request = SKProductsRequest(productIdentifiers = identifiers)
            val delegate = object : NSObject(), SKProductsRequestDelegateProtocol {
                override fun productsRequest(
                    request: SKProductsRequest,
                    didReceiveResponse: SKProductsResponse,
                ) {
                    val products = didReceiveResponse.products
                        .filterIsInstance<SKProduct>()
                        .map { it.toSubscriptionProduct() }
                    cont.resume(products)
                }

                override fun request(request: SKRequest, didFailWithError: NSError) {
                    cont.resume(emptyList())
                }
            }
            request.delegate = delegate
            request.start()
            cont.invokeOnCancellation { request.cancel() }
        }

    override suspend fun purchase(productId: String): PurchaseResult {
        if (pendingPurchaseDeferred?.isActive == true) return PurchaseResult.Error("A purchase is already in progress")
        val skProduct = suspendCancellableCoroutine<SKProduct?> { cont ->
            val identifiers = setOf(productId)
            val request = SKProductsRequest(productIdentifiers = identifiers)
            val delegate = object : NSObject(), SKProductsRequestDelegateProtocol {
                override fun productsRequest(
                    request: SKProductsRequest,
                    didReceiveResponse: SKProductsResponse,
                ) {
                    cont.resume(didReceiveResponse.products.filterIsInstance<SKProduct>().firstOrNull())
                }

                override fun request(request: SKRequest, didFailWithError: NSError) {
                    cont.resume(null)
                }
            }
            request.delegate = delegate
            request.start()
            cont.invokeOnCancellation { request.cancel() }
        } ?: return PurchaseResult.Error("Product not found: $productId")

        pendingPurchaseDeferred = CompletableDeferred()
        SKPaymentQueue.defaultQueue().addPayment(SKPayment.paymentWithProduct(skProduct))
        return pendingPurchaseDeferred!!.await()
    }

    override suspend fun restorePurchases(): RestoreResult {
        restoredCount = 0
        pendingRestoreDeferred = CompletableDeferred()
        SKPaymentQueue.defaultQueue().restoreCompletedTransactions()
        return pendingRestoreDeferred!!.await()
    }

    // ── SKPaymentTransactionObserverProtocol ──────────────────────────────────

    override fun paymentQueue(queue: SKPaymentQueue, updatedTransactions: List<Any?>) {
        for (transaction in updatedTransactions.filterIsInstance<SKPaymentTransaction>()) {
            when (transaction.transactionState) {
                SKPaymentTransactionState.SKPaymentTransactionStatePurchased -> {
                    queue.finishTransaction(transaction)
                    pendingPurchaseDeferred?.complete(PurchaseResult.Success)
                    pendingPurchaseDeferred = null
                }
                SKPaymentTransactionState.SKPaymentTransactionStateFailed -> {
                    queue.finishTransaction(transaction)
                    val cancelled =
                        transaction.error?.code == SKErrorCode.SKErrorPaymentCancelled.value.toLong()
                    pendingPurchaseDeferred?.complete(
                        if (cancelled) PurchaseResult.Cancelled
                        else PurchaseResult.Error(
                            transaction.error?.localizedDescription ?: "Purchase failed"
                        )
                    )
                    pendingPurchaseDeferred = null
                }
                SKPaymentTransactionState.SKPaymentTransactionStateRestored -> {
                    queue.finishTransaction(transaction)
                    restoredCount++
                }
                else -> Unit
            }
        }
    }

    override fun paymentQueueRestoreCompletedTransactionsFinished(queue: SKPaymentQueue) {
        pendingRestoreDeferred?.complete(
            if (restoredCount > 0) RestoreResult.Restored else RestoreResult.NothingToRestore
        )
        pendingRestoreDeferred = null
        restoredCount = 0
    }

    override fun paymentQueue(
        queue: SKPaymentQueue,
        restoreCompletedTransactionsFailedWithError: NSError,
    ) {
        pendingRestoreDeferred?.complete(
            RestoreResult.Error(restoreCompletedTransactionsFailedWithError.localizedDescription)
        )
        pendingRestoreDeferred = null
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun SKProduct.toSubscriptionProduct(): SubscriptionProduct {
        val formatter = NSNumberFormatter().apply {
            numberStyle = NSNumberFormatterCurrencyStyle
            locale = priceLocale
        }
        return SubscriptionProduct(
            id = productIdentifier,
            displayPrice = formatter.stringFromNumber(price) ?: price.stringValue,
        )
    }
}
