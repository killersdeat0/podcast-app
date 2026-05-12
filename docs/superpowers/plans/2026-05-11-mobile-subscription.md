# Mobile IAP Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Profile screen's stub upgrade popup with real native IAP flows on Android (Google Play Billing 6) and iOS (StoreKit 1), displaying Monthly ($4.99/mo) and Annual ($50/yr) plan cards matching the web design.

**Architecture:** A `BillingHandler` expect/actual (mirroring `AudioPlayer`) abstracts platform IAP; `BillingRepository` wraps it and upserts `tier = 'paid'` in Supabase on success; `ProfileFeature` gains new purchase/restore UDF flows; `SubscriptionPlansSection` replaces the existing `PremiumCard` and `AlertDialog` stub on the Profile screen.

**Tech Stack:** Google Play Billing Library 6 (Android), StoreKit 1 ObjC APIs (iOS), Supabase Kotlin SDK, Koin DI, Compose Multiplatform, Turbine (tests).

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-subscription-design.md`

**Naming note:** `SubscriptionRepository` is already taken by `com.trilium.syncpods.podcastdetail` (podcast-follow repository). The IAP repository is named **`BillingRepository`** throughout this plan to avoid import conflicts.

---

## File Map

**New files:**
- `composeApp/src/commonMain/kotlin/com/trilium/syncpods/billing/BillingHandler.kt`
- `composeApp/src/commonMain/kotlin/com/trilium/syncpods/billing/BillingRepository.kt`
- `composeApp/src/androidMain/kotlin/com/trilium/syncpods/billing/AndroidBillingHandler.kt`
- `composeApp/src/iosMain/kotlin/com/trilium/syncpods/billing/IOSBillingHandler.kt`
- `composeApp/src/commonTest/kotlin/com/trilium/syncpods/profile/ProfileFeatureSubscriptionTest.kt`

**Modified files:**
- `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt`
- `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileViewModel.kt`
- `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileScreen.kt`
- `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`
- `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/PlatformModule.kt`
- `composeApp/src/androidMain/kotlin/com/trilium/syncpods/di/PlatformModule.android.kt`
- `composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/PlatformModule.ios.kt`
- `composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt`
- `composeApp/src/androidMain/AndroidManifest.xml`
- `composeApp/build.gradle.kts`
- `mobile/CLAUDE.md`

---

## Task 1: BillingHandler types + BillingRepository interface

No tests needed for plain interfaces and data classes. These contracts are the foundation for all subsequent tasks.

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/billing/BillingHandler.kt`
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/billing/BillingRepository.kt`

- [ ] **Create `BillingHandler.kt`**

```kotlin
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
```

- [ ] **Create `BillingRepository.kt`** (interface only — impl added in Task 5)

```kotlin
package com.trilium.syncpods.billing

const val MONTHLY_PRODUCT_ID = "com.trilium.syncpods.monthly"
const val ANNUAL_PRODUCT_ID = "com.trilium.syncpods.annual"

interface BillingRepository {
    suspend fun getProducts(): List<SubscriptionProduct>
    suspend fun purchase(productId: String): PurchaseResult
    suspend fun restorePurchases(): RestoreResult
}
```

- [ ] **Compile check**

```bash
./gradlew :composeApp:assembleDebug 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/billing/
git commit -m "feat: add BillingHandler and BillingRepository contracts"
```

---

## Task 2: ProfileFeature — LoadProducts (TDD)

Extend `ProfileFeature` to load store prices on screen entry. The fakes defined here are reused in Tasks 3 and 4.

**Files:**
- Create: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/profile/ProfileFeatureSubscriptionTest.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt`

- [ ] **Write failing test — create `ProfileFeatureSubscriptionTest.kt`**

```kotlin
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
```

- [ ] **Run test to confirm it fails**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.profile.ProfileFeatureSubscriptionTest.ScreenVisible loads products into state" 2>&1 | tail -20
```
Expected: FAIL — `ProfileFeature` does not yet accept `billingRepository`

- [ ] **Add new types to `ProfileFeature.kt`**

**State** — add three fields:
```kotlin
data class ProfileState(
    val isLoading: Boolean = true,
    val isGuest: Boolean = false,
    val displayName: String = "",
    val email: String = "",
    val tier: String = "free",
    val subscriptions: List<SubscriptionSummary> = emptyList(),
    val error: String? = null,
    val products: List<SubscriptionProduct> = emptyList(),  // ← add
    val isPurchasing: Boolean = false,                       // ← add
    val isRestoring: Boolean = false,                        // ← add
)
```

**Events** — add three, remove one:
```kotlin
// Add:
data object SubscribeMonthlyTapped : ProfileEvent()
data object SubscribeAnnuallyTapped : ProfileEvent()
data object RestorePurchasesTapped : ProfileEvent()
// Remove: data object UpgradeTapped
```

**Actions** — add four, remove one:
```kotlin
// Add:
data object LoadProducts : ProfileAction()
data object PurchaseMonthly : ProfileAction()
data object PurchaseAnnual : ProfileAction()
data object RestorePurchases : ProfileAction()
// Remove: data object ShowUpgrade
```

**Results** — add nine:
```kotlin
data class ProductsLoaded(val products: List<SubscriptionProduct>) : ProfileResult()
data object PurchaseStarted : ProfileResult()
data object PurchaseSuccess : ProfileResult()
data object PurchaseCancelled : ProfileResult()
data class PurchaseFailed(val message: String) : ProfileResult()
data object RestoreStarted : ProfileResult()
data object RestoreSuccess : ProfileResult()
data object RestoreNothing : ProfileResult()
data class RestoreFailed(val message: String) : ProfileResult()
```

**Effects** — add four, remove one:
```kotlin
// Add:
data object ShowPurchaseSuccess : ProfileEffect()
data class ShowPurchaseError(val message: String) : ProfileEffect()
data object ShowRestoreSuccess : ProfileEffect()
data object ShowRestoreNothing : ProfileEffect()
// Remove: data object ShowUpgradeSheet
```

- [ ] **Update `ProfileFeature` class signature and add imports**

Add imports at the top of `ProfileFeature.kt`:
```kotlin
import com.trilium.syncpods.billing.BillingRepository
import com.trilium.syncpods.billing.PurchaseResult
import com.trilium.syncpods.billing.RestoreResult
import com.trilium.syncpods.billing.SubscriptionProduct
import com.trilium.syncpods.billing.MONTHLY_PRODUCT_ID
import com.trilium.syncpods.billing.ANNUAL_PRODUCT_ID
```

Change the class signature:
```kotlin
class ProfileFeature(
    scope: CoroutineScope,
    private val repository: ProfileRepository,
    private val billingRepository: BillingRepository,
) : StandardFeature<ProfileState, ProfileEvent, ProfileAction, ProfileResult, ProfileEffect>(scope) {
```

- [ ] **Wire LoadProducts in `eventToAction`**

In the `merge(...)` block, replace the `UpgradeTapped` mapping and add new ones:

```kotlin
// Replace this:
events.filterIsInstance<ProfileEvent.UpgradeTapped>()
    .map { ProfileAction.ShowUpgrade },

// With these:
events.filterIsInstance<ProfileEvent.ScreenVisible>()
    .map { ProfileAction.LoadProducts },

events.filterIsInstance<ProfileEvent.RetryTapped>()
    .map { ProfileAction.LoadProducts },

events.filterIsInstance<ProfileEvent.SubscribeMonthlyTapped>()
    .map { ProfileAction.PurchaseMonthly },

events.filterIsInstance<ProfileEvent.SubscribeAnnuallyTapped>()
    .map { ProfileAction.PurchaseAnnual },

events.filterIsInstance<ProfileEvent.RestorePurchasesTapped>()
    .map { ProfileAction.RestorePurchases },
```

(The existing `ScreenVisible → LoadProfile` and `RetryTapped → LoadProfile` mappings stay unchanged.)

- [ ] **Wire LoadProducts in `actionToResult`**

Add a `LoadProducts` branch and replace the `ShowUpgrade` branch with stubs for the three new purchase/restore actions (stubs keep `when` exhaustive; full logic added in Tasks 3–4):

```kotlin
is ProfileAction.LoadProducts -> flow {
    try {
        val products = billingRepository.getProducts()
        emit(ProfileResult.ProductsLoaded(products))
    } catch (_: Exception) {
        emit(ProfileResult.ProductsLoaded(emptyList()))
    }
}

// Remove: is ProfileAction.ShowUpgrade -> ...
// Add stubs (replaced in Tasks 3–4):
is ProfileAction.PurchaseMonthly -> flow<ProfileResult> { }
is ProfileAction.PurchaseAnnual -> flow<ProfileResult> { }
is ProfileAction.RestorePurchases -> flow<ProfileResult> { }
```

- [ ] **Wire all new results in `handleResult`**

```kotlin
is ProfileResult.ProductsLoaded -> previous.copy(products = result.products)
is ProfileResult.PurchaseStarted -> previous.copy(isPurchasing = true)
is ProfileResult.PurchaseSuccess -> previous.copy(isPurchasing = false, tier = "paid")
is ProfileResult.PurchaseCancelled -> previous.copy(isPurchasing = false)
is ProfileResult.PurchaseFailed -> previous.copy(isPurchasing = false)
is ProfileResult.RestoreStarted -> previous.copy(isRestoring = true)
is ProfileResult.RestoreSuccess -> previous.copy(isRestoring = false, tier = "paid")
is ProfileResult.RestoreNothing -> previous.copy(isRestoring = false)
is ProfileResult.RestoreFailed -> previous.copy(isRestoring = false)
```

- [ ] **Run test to confirm it passes**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.profile.ProfileFeatureSubscriptionTest.ScreenVisible loads products into state" 2>&1 | tail -10
```
Expected: `BUILD SUCCESSFUL`, 1 test passed

- [ ] **Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/profile/ProfileFeatureSubscriptionTest.kt
git commit -m "feat: add LoadProducts flow and billing types to ProfileFeature"
```

---

## Task 3: ProfileFeature — purchase flows (TDD)

**Files:**
- Modify: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/profile/ProfileFeatureSubscriptionTest.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt`

- [ ] **Add failing purchase tests to `ProfileFeatureSubscriptionTest.kt`**

Add these tests and imports to the class (alongside the existing test):

New imports needed at top of file:
```kotlin
import kotlin.test.assertFalse
import kotlin.test.assertIs
```

New tests:
```kotlin
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
```

- [ ] **Run tests to confirm they fail**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.profile.ProfileFeatureSubscriptionTest" 2>&1 | tail -20
```
Expected: 5 new failures, prior test still passes

- [ ] **Replace purchase stubs in `actionToResult`**

Replace:
```kotlin
is ProfileAction.PurchaseMonthly -> flow<ProfileResult> { }
is ProfileAction.PurchaseAnnual -> flow<ProfileResult> { }
```

With:
```kotlin
is ProfileAction.PurchaseMonthly -> flow {
    emit(ProfileResult.PurchaseStarted)
    val result = billingRepository.purchase(MONTHLY_PRODUCT_ID)
    when (result) {
        PurchaseResult.Success -> {
            _effects.emit(ProfileEffect.ShowPurchaseSuccess)
            emit(ProfileResult.PurchaseSuccess)
        }
        PurchaseResult.Cancelled -> emit(ProfileResult.PurchaseCancelled)
        is PurchaseResult.Error -> {
            _effects.emit(ProfileEffect.ShowPurchaseError(result.message))
            emit(ProfileResult.PurchaseFailed(result.message))
        }
    }
}

is ProfileAction.PurchaseAnnual -> flow {
    emit(ProfileResult.PurchaseStarted)
    val result = billingRepository.purchase(ANNUAL_PRODUCT_ID)
    when (result) {
        PurchaseResult.Success -> {
            _effects.emit(ProfileEffect.ShowPurchaseSuccess)
            emit(ProfileResult.PurchaseSuccess)
        }
        PurchaseResult.Cancelled -> emit(ProfileResult.PurchaseCancelled)
        is PurchaseResult.Error -> {
            _effects.emit(ProfileEffect.ShowPurchaseError(result.message))
            emit(ProfileResult.PurchaseFailed(result.message))
        }
    }
}
```

- [ ] **Run tests to confirm they pass**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.profile.ProfileFeatureSubscriptionTest" 2>&1 | tail -10
```
Expected: `BUILD SUCCESSFUL`, 6 tests passed

- [ ] **Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/profile/ProfileFeatureSubscriptionTest.kt
git commit -m "feat: implement purchase flows in ProfileFeature"
```

---

## Task 4: ProfileFeature — restore flow + remove old stub

**Files:**
- Modify: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/profile/ProfileFeatureSubscriptionTest.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt`

- [ ] **Add failing restore tests**

Append these tests to the class:
```kotlin
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
```

- [ ] **Run tests to confirm 3 new failures**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.profile.ProfileFeatureSubscriptionTest" 2>&1 | tail -20
```
Expected: 3 failures on restore tests, 6 prior pass

- [ ] **Replace restore stub in `actionToResult`**

Replace:
```kotlin
is ProfileAction.RestorePurchases -> flow<ProfileResult> { }
```

With:
```kotlin
is ProfileAction.RestorePurchases -> flow {
    emit(ProfileResult.RestoreStarted)
    val result = billingRepository.restorePurchases()
    when (result) {
        RestoreResult.Restored -> {
            _effects.emit(ProfileEffect.ShowRestoreSuccess)
            emit(ProfileResult.RestoreSuccess)
        }
        RestoreResult.NothingToRestore -> {
            _effects.emit(ProfileEffect.ShowRestoreNothing)
            emit(ProfileResult.RestoreNothing)
        }
        is RestoreResult.Error -> emit(ProfileResult.RestoreFailed(result.message))
    }
}
```

- [ ] **Verify no lingering references to removed types**

Search and confirm these no longer appear in `ProfileFeature.kt`:
```bash
grep -n "ShowUpgrade\|UpgradeTapped\|ShowUpgradeSheet" \
  composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt
```
Expected: no output

- [ ] **Run all tests**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.profile.ProfileFeatureSubscriptionTest" 2>&1 | tail -10
```
Expected: `BUILD SUCCESSFUL`, 9 tests passed

- [ ] **Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/profile/ProfileFeatureSubscriptionTest.kt
git commit -m "feat: implement restore flow in ProfileFeature; remove upgrade stub"
```

---

## Task 5: BillingRepositoryImpl

No unit tests — the delegation is a trivial pass-through and the Supabase update requires network. Consistent with how other repository impls are handled in this codebase.

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/billing/BillingRepository.kt`

- [ ] **Append `BillingRepositoryImpl` to `BillingRepository.kt`**

```kotlin
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from

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
        supabase.from("user_profiles")
            .update({ set("tier", "paid") }) {
                filter { eq("user_id", userId) }
            }
    }
}
```

- [ ] **Compile check**

```bash
./gradlew :composeApp:assembleDebug 2>&1 | grep -E "error:|BUILD" | tail -10
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/billing/BillingRepository.kt
git commit -m "feat: implement BillingRepositoryImpl with Supabase tier update on purchase"
```

---

## Task 6: AndroidBillingHandler

**Files:**
- Create: `composeApp/src/androidMain/kotlin/com/trilium/syncpods/billing/AndroidBillingHandler.kt`

- [ ] **Create `AndroidBillingHandler.kt`**

```kotlin
package com.trilium.syncpods.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import java.lang.ref.WeakReference
import kotlin.coroutines.resume

class AndroidBillingHandler(context: Context) : BillingHandler {

    private var activityRef: WeakReference<Activity> = WeakReference(null)
    private var pendingPurchaseDeferred: CompletableDeferred<PurchaseResult>? = null

    private val billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener { billingResult, purchases ->
            val deferred = pendingPurchaseDeferred ?: return@setListener
            pendingPurchaseDeferred = null
            when {
                billingResult.responseCode == BillingClient.BillingResponseCode.OK
                        && !purchases.isNullOrEmpty() -> {
                    val purchase = purchases.first()
                    if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                        acknowledgePurchase(purchase)
                        deferred.complete(PurchaseResult.Success)
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
        return suspendCancellableCoroutine { cont ->
            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            ) { result, purchases ->
                when {
                    result.responseCode != BillingClient.BillingResponseCode.OK ->
                        cont.resume(RestoreResult.Error(result.debugMessage))
                    purchases.any { it.purchaseState == Purchase.PurchaseState.PURCHASED } -> {
                        purchases
                            .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                            .forEach { acknowledgePurchase(it) }
                        cont.resume(RestoreResult.Restored)
                    }
                    else -> cont.resume(RestoreResult.NothingToRestore)
                }
            }
        }
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

    private fun acknowledgePurchase(purchase: Purchase) {
        if (purchase.isAcknowledged) return
        billingClient.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
        ) { }
    }

    private suspend fun ensureConnected() {
        if (billingClient.isReady) return
        suspendCancellableCoroutine { cont ->
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) { cont.resume(Unit) }
                override fun onBillingServiceDisconnected() { }
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
```

- [ ] **Compile check (Android target)**

```bash
./gradlew :composeApp:assembleDebug 2>&1 | grep -E "error:|BUILD" | tail -10
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Commit**

```bash
git add composeApp/src/androidMain/kotlin/com/trilium/syncpods/billing/AndroidBillingHandler.kt
git commit -m "feat: implement AndroidBillingHandler with Google Play Billing 6"
```

---

## Task 7: IOSBillingHandler

Uses StoreKit 1 ObjC-compatible APIs — directly accessible from Kotlin/Native without a Swift wrapper.

**Files:**
- Create: `composeApp/src/iosMain/kotlin/com/trilium/syncpods/billing/IOSBillingHandler.kt`

- [ ] **Create `IOSBillingHandler.kt`**

```kotlin
package com.trilium.syncpods.billing

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.Foundation.*
import platform.StoreKit.*
import kotlin.coroutines.resume

class IOSBillingHandler : BillingHandler, SKPaymentTransactionObserverProtocol {

    private var pendingPurchaseDeferred: CompletableDeferred<PurchaseResult>? = null
    private var pendingRestoreDeferred: CompletableDeferred<RestoreResult>? = null
    private var restoredCount = 0

    init {
        SKPaymentQueue.defaultQueue().addTransactionObserver(this)
    }

    // ── BillingHandler ────────────────────────────────────────────────────────

    override suspend fun getProducts(productIds: List<String>): List<SubscriptionProduct> =
        suspendCancellableCoroutine { cont ->
            val identifiers = NSMutableSet.set() as NSMutableSet<NSString>
            productIds.forEach { identifiers.addObject(it as NSString) }
            val request = SKProductsRequest(productIdentifiers = identifiers)
            val delegate = object : NSObject(), SKProductsRequestDelegateProtocol {
                override fun productsRequest(
                    request: SKProductsRequest,
                    didReceiveResponse response: SKProductsResponse,
                ) {
                    val products = response.products
                        .filterIsInstance<SKProduct>()
                        .map { it.toSubscriptionProduct() }
                    cont.resume(products)
                }

                override fun request(request: SKRequest, didFailWithError error: NSError) {
                    cont.resume(emptyList())
                }
            }
            request.delegate = delegate
            request.start()
            cont.invokeOnCancellation { request.cancel() }
        }

    override suspend fun purchase(productId: String): PurchaseResult {
        val skProduct = suspendCancellableCoroutine<SKProduct?> { cont ->
            val identifiers = NSMutableSet.set() as NSMutableSet<NSString>
            identifiers.addObject(productId as NSString)
            val request = SKProductsRequest(productIdentifiers = identifiers)
            val delegate = object : NSObject(), SKProductsRequestDelegateProtocol {
                override fun productsRequest(
                    request: SKProductsRequest,
                    didReceiveResponse response: SKProductsResponse,
                ) {
                    cont.resume(response.products.filterIsInstance<SKProduct>().firstOrNull())
                }

                override fun request(request: SKRequest, didFailWithError error: NSError) {
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

    override fun paymentQueue(queue: SKPaymentQueue, updatedTransactions: List<*>) {
        for (transaction in updatedTransactions.filterIsInstance<SKPaymentTransaction>()) {
            when (transaction.transactionState) {
                SKPaymentTransactionStatePurchased -> {
                    queue.finishTransaction(transaction)
                    pendingPurchaseDeferred?.complete(PurchaseResult.Success)
                    pendingPurchaseDeferred = null
                }
                SKPaymentTransactionStateFailed -> {
                    queue.finishTransaction(transaction)
                    val cancelled = transaction.error?.code == SKErrorPaymentCancelled.toLong()
                    pendingPurchaseDeferred?.complete(
                        if (cancelled) PurchaseResult.Cancelled
                        else PurchaseResult.Error(
                            transaction.error?.localizedDescription ?: "Purchase failed"
                        )
                    )
                    pendingPurchaseDeferred = null
                }
                SKPaymentTransactionStateRestored -> {
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
        restoreCompletedTransactionsFailedWithError error: NSError,
    ) {
        pendingRestoreDeferred?.complete(RestoreResult.Error(error.localizedDescription))
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
```

- [ ] **Compile check (iOS target)**

```bash
./gradlew :composeApp:iosX64MainKlibrary 2>&1 | grep -E "error:|BUILD" | tail -10
```
Expected: `BUILD SUCCESSFUL` (requires macOS; alternatively build via Xcode)

- [ ] **Commit**

```bash
git add composeApp/src/iosMain/kotlin/com/trilium/syncpods/billing/IOSBillingHandler.kt
git commit -m "feat: implement IOSBillingHandler with StoreKit 1"
```

---

## Task 8: Platform DI + AppModule + ProfileViewModel

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/PlatformModule.kt`
- Modify: `composeApp/src/androidMain/kotlin/com/trilium/syncpods/di/PlatformModule.android.kt`
- Modify: `composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/PlatformModule.ios.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileViewModel.kt`

- [ ] **Add `expect fun billingHandlerModule()` to `PlatformModule.kt`**

Append after `expect fun audioPlayerModule(): Module`:
```kotlin
expect fun billingHandlerModule(): Module
```

- [ ] **Add `actual fun billingHandlerModule()` to `PlatformModule.android.kt`**

Add imports and append to file:
```kotlin
import com.trilium.syncpods.billing.AndroidBillingHandler
import com.trilium.syncpods.billing.BillingHandler

actual fun billingHandlerModule(): Module = module {
    single<BillingHandler> { AndroidBillingHandler(androidContext()) }
}
```

- [ ] **Add `actual fun billingHandlerModule()` to `PlatformModule.ios.kt`**

Add imports and append to file:
```kotlin
import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.billing.IOSBillingHandler

actual fun billingHandlerModule(): Module = module {
    single<BillingHandler> { IOSBillingHandler() }
}
```

- [ ] **Update `AppModule.kt`**

Change:
```kotlin
includes(audioPlayerModule())
```
To:
```kotlin
includes(audioPlayerModule(), billingHandlerModule())
```

Add imports:
```kotlin
import com.trilium.syncpods.billing.BillingRepository
import com.trilium.syncpods.billing.BillingRepositoryImpl
```

Add a `BillingRepository` single (place it near the existing `ProfileRepository` single):
```kotlin
single<BillingRepository> { BillingRepositoryImpl(billingHandler = get(), supabase = get()) }
```

Change:
```kotlin
viewModelOf(::ProfileViewModel)
```
To:
```kotlin
viewModel { ProfileViewModel(get(), get()) }
```

- [ ] **Update `ProfileViewModel.kt`**

```kotlin
package com.trilium.syncpods.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.billing.BillingRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class ProfileViewModel(
    profileRepository: ProfileRepository,
    billingRepository: BillingRepository,
) : ViewModel() {
    val feature = ProfileFeature(
        scope = viewModelScope + Dispatchers.Default,
        repository = profileRepository,
        billingRepository = billingRepository,
    )
}
```

- [ ] **Compile check and full test run**

```bash
./gradlew :composeApp:assembleDebug 2>&1 | grep -E "error:|BUILD" | tail -5
./gradlew :composeApp:testDebugUnitTest 2>&1 | tail -10
```
Expected: both `BUILD SUCCESSFUL`, all tests pass

- [ ] **Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/ \
        composeApp/src/androidMain/kotlin/com/trilium/syncpods/di/ \
        composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/ \
        composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileViewModel.kt
git commit -m "feat: wire BillingRepository and BillingHandler into DI"
```

---

## Task 9: Android project setup

**Files:**
- Modify: `composeApp/build.gradle.kts`
- Modify: `composeApp/src/androidMain/AndroidManifest.xml`
- Modify: `composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt`

- [ ] **Add `billing-ktx` to `build.gradle.kts`**

In the `androidMain.dependencies { }` block, add:
```kotlin
implementation("com.android.billingclient:billing-ktx:7.1.1")
```

- [ ] **Add BILLING permission to `AndroidManifest.xml`**

Add inside `<manifest>`, before `<application>`:
```xml
<uses-permission android:name="com.android.vending.BILLING" />
```

- [ ] **Add lifecycle wiring to `MainActivity.kt`**

Add to imports:
```kotlin
import com.trilium.syncpods.billing.AndroidBillingHandler
import com.trilium.syncpods.billing.BillingHandler
```

Add property alongside the existing `by inject()` properties:
```kotlin
private val billingHandler: BillingHandler by inject()
```

Add lifecycle overrides after `onNewIntent`:
```kotlin
override fun onResume() {
    super.onResume()
    (billingHandler as? AndroidBillingHandler)?.onActivityResumed(this)
}

override fun onPause() {
    super.onPause()
    (billingHandler as? AndroidBillingHandler)?.onActivityPaused()
}
```

- [ ] **Compile check**

```bash
./gradlew :composeApp:assembleDebug 2>&1 | grep -E "error:|BUILD" | tail -5
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Commit**

```bash
git add composeApp/build.gradle.kts \
        composeApp/src/androidMain/AndroidManifest.xml \
        composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt
git commit -m "feat: add Play Billing dependency, BILLING permission, and lifecycle wiring"
```

---

## Task 10: UI — SubscriptionPlansSection

Replace `PremiumCard` and remove the `AlertDialog` stub. Introduces two plan cards matching the web design.

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileScreen.kt`

- [ ] **Remove `showUpgradeSheet` and `AlertDialog` from `ProfileScreen`**

Delete:
```kotlin
var showUpgradeSheet by remember { mutableStateOf(false) }
```

In the `LaunchedEffect` effect handler, delete:
```kotlin
is ProfileEffect.ShowUpgradeSheet -> showUpgradeSheet = true
```

Delete the entire `if (showUpgradeSheet) { AlertDialog(...) }` block at the bottom of `ProfileScreen`.

Remove unused imports `AlertDialog` (keep `TextButton` — it's used in `SubscriptionPlansSection`).

- [ ] **Wrap `ProfileScreen` body in a `Box` to support toast overlay**

Change the outer structure from:
```kotlin
Column(modifier = modifier.fillMaxSize()) {
    // top bar
    // content switch
}
```
To:
```kotlin
Box(modifier = modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
        // top bar
        // content switch
    }

    feedbackMessage?.let { msg ->
        LaunchedEffect(msg) {
            kotlinx.coroutines.delay(3000)
            feedbackMessage = null
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = bottomContentPadding + 16.dp),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.inverseSurface,
                modifier = Modifier.padding(horizontal = 24.dp),
            ) {
                Text(
                    text = msg,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.inverseOnSurface,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                )
            }
        }
    }
}
```

Add `feedbackMessage` local state at the top of `ProfileScreen` (alongside `state`):
```kotlin
var feedbackMessage by remember { mutableStateOf<String?>(null) }
```

Add the four new effect handlers to the `LaunchedEffect` collector:
```kotlin
is ProfileEffect.ShowPurchaseSuccess -> feedbackMessage = "Subscription activated!"
is ProfileEffect.ShowPurchaseError -> feedbackMessage = effect.message
is ProfileEffect.ShowRestoreSuccess -> feedbackMessage = "Subscription restored!"
is ProfileEffect.ShowRestoreNothing -> feedbackMessage = "No previous subscription found."
```

- [ ] **Update `GuestContent` signature to receive `state`**

Change:
```kotlin
@Composable
private fun GuestContent(
    feature: ProfileFeature,
    bottomContentPadding: Dp,
)
```
To:
```kotlin
@Composable
private fun GuestContent(
    state: ProfileState,
    feature: ProfileFeature,
    bottomContentPadding: Dp,
)
```

Update its call site in `ProfileScreen`:
```kotlin
state.isGuest -> GuestContent(
    state = state,
    feature = feature,
    bottomContentPadding = bottomContentPadding,
)
```

- [ ] **Replace `PremiumCard` in `GuestContent` with `SubscriptionPlansSection`**

Replace:
```kotlin
PremiumCard(
    title = "Premium Subscription",
    buttonLabel = "Upgrade for \$4.99/mo",
    onUpgradeTapped = { feature.process(ProfileEvent.UpgradeTapped) },
)
```
With:
```kotlin
SubscriptionPlansSection(
    products = state.products,
    isPurchasing = state.isPurchasing,
    isRestoring = state.isRestoring,
    onSubscribeMonthly = { feature.process(ProfileEvent.SubscribeMonthlyTapped) },
    onSubscribeAnnual = { feature.process(ProfileEvent.SubscribeAnnuallyTapped) },
    onRestorePurchases = { feature.process(ProfileEvent.RestorePurchasesTapped) },
)
```

- [ ] **Replace `PremiumCard` in `LoggedInContent` with `SubscriptionPlansSection`**

Replace:
```kotlin
if (state.tier != "paid") {
    PremiumCard(
        title = "Upgrade to Premium",
        buttonLabel = "Subscribe for \$4.99/mo",
        onUpgradeTapped = { feature.process(ProfileEvent.UpgradeTapped) },
        modifier = Modifier.padding(horizontal = 16.dp),
    )
    Spacer(Modifier.height(20.dp))
}
```
With:
```kotlin
if (state.tier != "paid") {
    SubscriptionPlansSection(
        products = state.products,
        isPurchasing = state.isPurchasing,
        isRestoring = state.isRestoring,
        onSubscribeMonthly = { feature.process(ProfileEvent.SubscribeMonthlyTapped) },
        onSubscribeAnnual = { feature.process(ProfileEvent.SubscribeAnnuallyTapped) },
        onRestorePurchases = { feature.process(ProfileEvent.RestorePurchasesTapped) },
        modifier = Modifier.padding(horizontal = 16.dp),
    )
    Spacer(Modifier.height(20.dp))
}
```

- [ ] **Delete the old `PremiumCard` composable**

Remove the entire `@Composable private fun PremiumCard(...)` function.

- [ ] **Add new imports to `ProfileScreen.kt`**

```kotlin
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.offset
import kotlinx.coroutines.delay
import com.trilium.syncpods.billing.ANNUAL_PRODUCT_ID
import com.trilium.syncpods.billing.MONTHLY_PRODUCT_ID
import com.trilium.syncpods.billing.SubscriptionProduct
```

- [ ] **Add `SubscriptionPlansSection` and `PlanCard` composables**

Append before the `LoadingContent` function:

```kotlin
@Composable
private fun SubscriptionPlansSection(
    products: List<SubscriptionProduct>,
    isPurchasing: Boolean,
    isRestoring: Boolean,
    onSubscribeMonthly: () -> Unit,
    onSubscribeAnnual: () -> Unit,
    onRestorePurchases: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val monthlyProduct = products.find { it.id == MONTHLY_PRODUCT_ID }
    val annualProduct = products.find { it.id == ANNUAL_PRODUCT_ID }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Unlock all features: unlimited queue, full playback speed range, complete history, and no ads.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))

        PlanCard(
            title = "Monthly",
            price = monthlyProduct?.displayPrice ?: "$4.99",
            priceSuffix = " / month",
            badge = null,
            monthlyEquiv = null,
            isPurchasing = isPurchasing,
            buttonLabel = "Subscribe Monthly",
            onSubscribe = onSubscribeMonthly,
            isHighlighted = false,
        )

        Spacer(Modifier.height(12.dp))

        PlanCard(
            title = "Annual",
            price = annualProduct?.displayPrice ?: "$50.00",
            priceSuffix = " / year",
            badge = "Save 17%",
            monthlyEquiv = "~$4.17/month",
            isPurchasing = isPurchasing,
            buttonLabel = "Subscribe Annually",
            onSubscribe = onSubscribeAnnual,
            isHighlighted = true,
        )

        Spacer(Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (isRestoring) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
            TextButton(
                onClick = onRestorePurchases,
                enabled = !isRestoring && !isPurchasing,
            ) {
                Text(
                    text = "Restore Purchases",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PlanCard(
    title: String,
    price: String,
    priceSuffix: String,
    badge: String?,
    monthlyEquiv: String?,
    isPurchasing: Boolean,
    buttonLabel: String,
    onSubscribe: () -> Unit,
    isHighlighted: Boolean,
    modifier: Modifier = Modifier,
) {
    val borderColor = if (isHighlighted) MaterialTheme.colorScheme.primary
                      else MaterialTheme.colorScheme.outlineVariant

    Box(modifier = modifier.fillMaxWidth()) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            border = BorderStroke(1.dp, borderColor),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.Baseline) {
                    Text(
                        text = price,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = priceSuffix,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (monthlyEquiv != null) {
                    Text(
                        text = monthlyEquiv,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(12.dp))
                listOf("Unlimited queue", "All playback speeds", "Full history", "No ads").forEach {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = onSubscribe,
                    enabled = !isPurchasing,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                ) {
                    if (isPurchasing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(text = buttonLabel)
                    }
                }
            }
        }

        if (badge != null) {
            Surface(
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 12.dp)
                    .offset(y = (-12).dp),
            ) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}
```

- [ ] **Compile check and test run**

```bash
./gradlew :composeApp:assembleDebug 2>&1 | grep -E "error:|BUILD" | tail -5
./gradlew :composeApp:testDebugUnitTest 2>&1 | tail -10
```
Expected: both `BUILD SUCCESSFUL`, all tests pass

- [ ] **Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/profile/ProfileScreen.kt
git commit -m "feat: replace PremiumCard with SubscriptionPlansSection on Profile screen"
```

---

## Task 11: Docs update

**Files:**
- Modify: `mobile/CLAUDE.md`

- [ ] **Add billing package to Package Structure in `mobile/CLAUDE.md`**

In the `commonMain/kotlin/com/trilium/syncpods/` directory tree, add:
```
├── billing/
│   ├── BillingHandler.kt          ← interface + SubscriptionProduct, PurchaseResult, RestoreResult
│   └── BillingRepository.kt       ← BillingRepository interface + BillingRepositoryImpl + product ID constants
```

In the `androidMain` tree, add:
```
└── billing/AndroidBillingHandler.kt   ← BillingHandler impl (Google Play Billing 6)
```

In the `iosMain` tree, add:
```
└── billing/IOSBillingHandler.kt       ← BillingHandler impl (StoreKit 1)
```

After the `AudioPlayer expect/actual:` paragraph, add:

**BillingHandler expect/actual:** `BillingHandler` is an interface in commonMain with `AndroidBillingHandler` (androidMain, Google Play Billing 6) and `IOSBillingHandler` (iosMain, StoreKit 1 ObjC APIs) as platform implementations. `AndroidBillingHandler` holds a `WeakReference<Activity>` updated via `onActivityResumed`/`onActivityPaused` in `MainActivity`. `BillingRepository` wraps the handler and directly upserts `tier = 'paid'` in `user_profiles` on successful purchase. Registered via `billingHandlerModule()` — same expect/actual pattern as `audioPlayerModule()`.

**Naming note:** `BillingRepository` (IAP) is distinct from `podcastdetail.SubscriptionRepository` (podcast-follow). This naming was intentional to avoid Koin type conflicts.

- [ ] **Commit**

```bash
git add mobile/CLAUDE.md
git commit -m "docs: document billing package and BillingHandler expect/actual pattern"
```
