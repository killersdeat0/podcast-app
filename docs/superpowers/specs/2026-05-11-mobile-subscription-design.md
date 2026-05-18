# Mobile Subscription (IAP) Design

**Date:** 2026-05-11
**Scope:** Replace the Profile screen's stub upgrade popup with real in-app purchase flows on Android (Google Play Billing) and iOS (StoreKit), mirroring the two-plan layout already live on the web.

---

## Context

The web upgrade page offers two plans — Monthly ($4.99/month) and Annual ($50/year) — via Stripe Checkout. The mobile Profile screen currently shows a single "Subscribe for $4.99/mo" button that opens an `AlertDialog` stub. This feature replaces that stub with native IAP using the same plan structure.

Apple App Store and Google Play Store policies require digital-goods subscriptions to use their respective native billing systems, so Stripe is not used on mobile. Purchase verification is client-trusted: after a successful IAP callback the app directly upserts `tier = 'paid'` in Supabase.

---

## Architecture

Four layers, all following existing project conventions:

```
UI (ProfileScreen)
  ↓ events
ProfileFeature (UDF pipeline)
  ↓ calls
SubscriptionRepository (commonMain)
  ↓ delegates to
BillingHandler (expect/actual)   +   SupabaseClient (tier upsert)
  ↓
AndroidBillingHandler / IOSBillingHandler
```

---

## 1. `BillingHandler` — expect/actual

**File:** `commonMain/.../billing/BillingHandler.kt`

```kotlin
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
```

### `AndroidBillingHandler` (androidMain)

- Koin singleton, receives `Application` context for `BillingClient` initialisation
- Holds `WeakReference<Activity>`, updated via `onActivityResumed(activity)` / `onActivityPaused()` called from `MainActivity` lifecycle callbacks
- `getProducts()` — `queryProductDetailsAsync()` for `ProductType.SUBS`
- `purchase()` — `launchBillingFlow()` with stored Activity; result bridged to `CompletableDeferred` via `PurchasesUpdatedListener`
- `restorePurchases()` — `queryPurchasesAsync(SUBS)`, acknowledges active purchases

Dependency added to `build.gradle.kts`:
```kotlin
implementation("com.android.billingclient:billing-ktx:7.1.1")
```

Permission added to `AndroidManifest.xml`:
```xml
<uses-permission android:name="com.android.vending.BILLING" />
```

### `IOSBillingHandler` (iosMain)

- Uses ObjC-compatible StoreKit 1 APIs — no Swift wrapper required, all accessible from Kotlin/Native
- `getProducts()` — wraps `SKProductsRequestDelegate` callback in `suspendCancellableCoroutine`
- `purchase()` — adds payment to `SKPaymentQueue`; bridges `SKPaymentTransactionObserver` callback to `CompletableDeferred`
- `restorePurchases()` — calls `SKPaymentQueue.default().restoreCompletedTransactions()`, awaits observer callbacks

No new Xcode entitlements or capabilities required; StoreKit is already available as a system framework.

---

## 2. `SubscriptionRepository` (commonMain)

**File:** `commonMain/.../billing/SubscriptionRepository.kt`

```kotlin
const val MONTHLY_PRODUCT_ID = "com.trilium.syncpods.monthly"
const val ANNUAL_PRODUCT_ID  = "com.trilium.syncpods.annual"

interface SubscriptionRepository {
    suspend fun getProducts(): List<SubscriptionProduct>
    suspend fun purchase(productId: String): PurchaseResult
    suspend fun restorePurchases(): RestoreResult
}
```

`SubscriptionRepositoryImpl(billingHandler: BillingHandler, supabase: SupabaseClient)`:

- `getProducts()` — delegates to `billingHandler.getProducts(listOf(MONTHLY_PRODUCT_ID, ANNUAL_PRODUCT_ID))`
- `purchase()` — delegates to `billingHandler.purchase(productId)`; on `Success` upserts `{ tier: "paid" }` into `user_profiles` for the current user
- `restorePurchases()` — delegates to `billingHandler.restorePurchases()`; on `Restored` performs the same upsert

Prices are always fetched live from the store — never hardcoded in the UI — to comply with App Store pricing display rules.

---

## 3. Profile UDF Changes

### New events
```kotlin
data object SubscribeMonthlyTapped : ProfileEvent()
data object SubscribeAnnuallyTapped : ProfileEvent()
data object RestorePurchasesTapped : ProfileEvent()
```

### New actions
```kotlin
data object LoadProducts : ProfileAction()
data object PurchaseMonthly : ProfileAction()
data object PurchaseAnnual : ProfileAction()
data object RestorePurchases : ProfileAction()
```

### New results
```kotlin
data class ProductsLoaded(val products: List<SubscriptionProduct>) : ProfileResult()
data object PurchaseSuccess : ProfileResult()
data object PurchaseCancelled : ProfileResult()
data class PurchaseFailed(val message: String) : ProfileResult()
data object RestoreSuccess : ProfileResult()
data object RestoreNothing : ProfileResult()
data class RestoreFailed(val message: String) : ProfileResult()
```

### State additions
```kotlin
val isPurchasing: Boolean = false   // disables both plan buttons while a purchase is in flight
val isRestoring: Boolean = false
val products: List<SubscriptionProduct> = emptyList()
```

### New effects
```kotlin
data object ShowPurchaseSuccess : ProfileEffect()
data class ShowPurchaseError(val message: String) : ProfileEffect()
data object ShowRestoreSuccess : ProfileEffect()
data object ShowRestoreNothing : ProfileEffect()
```

`PurchaseSuccess` and `RestoreSuccess` results emit their effect **and** re-dispatch `LoadProfile` so the tier badge flips to "PRO" automatically.

`ProfileFeature` gains a `SubscriptionRepository` constructor parameter alongside the existing `ProfileRepository`. `ProfileViewModel` passes it through.

The existing `ProfileEffect.ShowUpgradeSheet` effect and `ProfileAction.ShowUpgrade` action are removed.

---

## 4. UI Changes

**`ProfileScreen.kt`** changes:

- Remove the `showUpgradeSheet` local state variable and the `AlertDialog` block
- Remove the `ShowUpgradeSheet` effect handler
- Replace `PremiumCard` calls (in both `LoggedInContent` and `GuestContent`) with `SubscriptionPlansSection`

**New composable `SubscriptionPlansSection`:**

- Intro text: *"Unlock all features: unlimited queue, full playback speed range, complete history, and no ads."*
- Two plan cards (`MonthlyPlanCard`, `AnnualPlanCard`) stacked vertically in a `Column`
  - Monthly: title, **$4.99 / month**, feature bullet list, "Subscribe Monthly" button
  - Annual: "Save 17%" badge, title, **$50 / year**, *~$4.17/month*, same feature list, "Subscribe Annually" button
  - Annual card highlighted with `MaterialTheme.colorScheme.primary` border (matches web)
- Both subscribe buttons disabled + show `CircularProgressIndicator` while `state.isPurchasing`
- "Restore Purchases" `TextButton` centred below cards (required by Apple App Store guidelines)
- Restore link shows a small progress indicator while `state.isRestoring`

Prices displayed on the cards come from `state.products` (fetched from the store), not hardcoded strings.

`ProfileEvent.ScreenVisible` triggers `LoadProfile` **and** a new `LoadProducts` action so prices are fetched on screen entry.

---

## 5. DI Wiring

**`PlatformModule` (expect/actual) — following `AudioPlayer` pattern:**
- `androidMain`: `single<BillingHandler> { AndroidBillingHandler(androidContext()) }`
- `iosMain`: `single<BillingHandler> { IOSBillingHandler() }`

**`AppModule.kt`:**
```kotlin
single<SubscriptionRepository> { SubscriptionRepositoryImpl(get(), get()) }
viewModel { ProfileViewModel(get(), get()) }  // ProfileRepository + SubscriptionRepository
```

**`MainActivity` (Android only) — lifecycle wiring:**
```kotlin
override fun onResume() {
    super.onResume()
    (get<BillingHandler>() as AndroidBillingHandler).onActivityResumed(this)
}
override fun onPause() {
    super.onPause()
    (get<BillingHandler>() as AndroidBillingHandler).onActivityPaused()
}
```

---

## 6. Out of Scope

- Server-side subscription validation (receipts sent to Apple/Google servers)
- App Store Server Notifications / Google RTDN for renewals and cancellations
- Subscription management UI (cancellation, plan switching) — users manage via the OS Settings app
- Stripe portal link on mobile (web only)
