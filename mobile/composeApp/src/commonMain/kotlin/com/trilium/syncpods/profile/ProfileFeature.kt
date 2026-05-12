package com.trilium.syncpods.profile

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import com.trilium.syncpods.billing.BillingRepository
import com.trilium.syncpods.billing.PurchaseResult
import com.trilium.syncpods.billing.RestoreResult
import com.trilium.syncpods.billing.SubscriptionProduct
import com.trilium.syncpods.billing.MONTHLY_PRODUCT_ID
import com.trilium.syncpods.billing.ANNUAL_PRODUCT_ID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class ProfileState(
    val isLoading: Boolean = true,
    val isGuest: Boolean = false,
    val displayName: String = "",
    val email: String = "",
    val tier: String = "free",
    val subscriptions: List<SubscriptionSummary> = emptyList(),
    val error: String? = null,
    val products: List<SubscriptionProduct> = emptyList(),
    val isPurchasing: Boolean = false,
    val isRestoring: Boolean = false,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class ProfileEvent {
    data object ScreenVisible : ProfileEvent()
    data object SignInTapped : ProfileEvent()
    data object CreateAccountTapped : ProfileEvent()
    data class SubscriptionTapped(val feedUrl: String) : ProfileEvent()
    data object ViewAllSubscriptionsTapped : ProfileEvent()
    data object SettingsTapped : ProfileEvent()
    data object RetryTapped : ProfileEvent()
    data object SubscribeMonthlyTapped : ProfileEvent()
    data object SubscribeAnnuallyTapped : ProfileEvent()
    data object RestorePurchasesTapped : ProfileEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class ProfileAction {
    data object LoadProfile : ProfileAction()
    data object LoadProducts : ProfileAction()
    data object NavigateToSignIn : ProfileAction()
    data object NavigateToCreateAccount : ProfileAction()
    data class NavigateToPodcast(val feedUrl: String) : ProfileAction()
    data object NavigateToViewAll : ProfileAction()
    data object NavigateToSettings : ProfileAction()
    data object PurchaseMonthly : ProfileAction()
    data object PurchaseAnnual : ProfileAction()
    data object RestorePurchases : ProfileAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class ProfileResult {
    data object Loading : ProfileResult()
    data object GuestLoaded : ProfileResult()
    data class ProfileLoaded(
        val displayName: String,
        val email: String,
        val tier: String,
        val subscriptions: List<SubscriptionSummary>,
    ) : ProfileResult()
    data class LoadError(val message: String) : ProfileResult()
    data class ProductsLoaded(val products: List<SubscriptionProduct>) : ProfileResult()
    data object PurchaseStarted : ProfileResult()
    data object PurchaseSuccess : ProfileResult()
    data object PurchaseCancelled : ProfileResult()
    data class PurchaseFailed(val message: String) : ProfileResult()
    data object RestoreStarted : ProfileResult()
    data object RestoreSuccess : ProfileResult()
    data object RestoreNothing : ProfileResult()
    data class RestoreFailed(val message: String) : ProfileResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class ProfileEffect {
    data object NavigateToSignIn : ProfileEffect()
    data object NavigateToCreateAccount : ProfileEffect()
    data class NavigateToPodcastDetail(val feedUrl: String) : ProfileEffect()
    data object NavigateToSettings : ProfileEffect()
    data object NavigateToLibrary : ProfileEffect()
    data object ShowPurchaseSuccess : ProfileEffect()
    data class ShowPurchaseError(val message: String) : ProfileEffect()
    data object ShowRestoreSuccess : ProfileEffect()
    data object ShowRestoreNothing : ProfileEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileFeature(
    scope: CoroutineScope,
    private val repository: ProfileRepository,
    private val billingRepository: BillingRepository,
) : StandardFeature<ProfileState, ProfileEvent, ProfileAction, ProfileResult, ProfileEffect>(scope) {

    private val _effects = MutableSharedFlow<ProfileEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<ProfileEffect> get() = _effects

    override val initial = ProfileState()

    override val eventToAction: Interactor<ProfileEvent, ProfileAction> = { events ->
        merge(
            events.filterIsInstance<ProfileEvent.ScreenVisible>()
                .map { ProfileAction.LoadProfile },

            events.filterIsInstance<ProfileEvent.ScreenVisible>()
                .map { ProfileAction.LoadProducts },

            events.filterIsInstance<ProfileEvent.RetryTapped>()
                .map { ProfileAction.LoadProfile },

            events.filterIsInstance<ProfileEvent.RetryTapped>()
                .map { ProfileAction.LoadProducts },

            repository.authStateChanges()
                .map { ProfileAction.LoadProfile },

            events.filterIsInstance<ProfileEvent.SignInTapped>()
                .map { ProfileAction.NavigateToSignIn },

            events.filterIsInstance<ProfileEvent.CreateAccountTapped>()
                .map { ProfileAction.NavigateToCreateAccount },

            events.filterIsInstance<ProfileEvent.SubscriptionTapped>()
                .map { ProfileAction.NavigateToPodcast(it.feedUrl) },

            events.filterIsInstance<ProfileEvent.ViewAllSubscriptionsTapped>()
                .map { ProfileAction.NavigateToViewAll },

            events.filterIsInstance<ProfileEvent.SettingsTapped>()
                .map { ProfileAction.NavigateToSettings },

            events.filterIsInstance<ProfileEvent.SubscribeMonthlyTapped>()
                .map { ProfileAction.PurchaseMonthly },

            events.filterIsInstance<ProfileEvent.SubscribeAnnuallyTapped>()
                .map { ProfileAction.PurchaseAnnual },

            events.filterIsInstance<ProfileEvent.RestorePurchasesTapped>()
                .map { ProfileAction.RestorePurchases },
        )
    }

    override val actionToResult: Interactor<ProfileAction, ProfileResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is ProfileAction.LoadProfile -> flow {
                    emit(ProfileResult.Loading)
                    try {
                        if (repository.isGuest()) {
                            emit(ProfileResult.GuestLoaded)
                        } else {
                            val profile = repository.getUserProfile()
                            val subscriptions = repository.getSubscriptions()
                            emit(
                                ProfileResult.ProfileLoaded(
                                    displayName = profile.displayName,
                                    email = profile.email,
                                    tier = profile.tier,
                                    subscriptions = subscriptions,
                                )
                            )
                        }
                    } catch (e: Exception) {
                        emit(ProfileResult.LoadError(e.message ?: "Failed to load profile"))
                    }
                }

                is ProfileAction.NavigateToSignIn -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToSignIn)
                }

                is ProfileAction.NavigateToCreateAccount -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToCreateAccount)
                }

                is ProfileAction.NavigateToPodcast -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToPodcastDetail(action.feedUrl))
                }

                is ProfileAction.NavigateToViewAll -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToLibrary)
                }

                is ProfileAction.NavigateToSettings -> flow<ProfileResult> {
                    _effects.emit(ProfileEffect.NavigateToSettings)
                }

                is ProfileAction.LoadProducts -> flow {
                    try {
                        val products = billingRepository.getProducts()
                        emit(ProfileResult.ProductsLoaded(products))
                    } catch (_: Exception) {
                        emit(ProfileResult.ProductsLoaded(emptyList()))
                    }
                }

                is ProfileAction.PurchaseMonthly -> flow<ProfileResult> { }
                is ProfileAction.PurchaseAnnual -> flow<ProfileResult> { }
                is ProfileAction.RestorePurchases -> flow<ProfileResult> { }
            }
        }
    }

    override suspend fun handleResult(
        previous: ProfileState,
        result: ProfileResult,
    ): ProfileState = when (result) {
        is ProfileResult.Loading -> {
            val hasData = previous.displayName.isNotEmpty() || previous.subscriptions.isNotEmpty() || previous.isGuest
            previous.copy(isLoading = !hasData, error = null)
        }

        is ProfileResult.GuestLoaded -> previous.copy(
            isLoading = false,
            isGuest = true,
            error = null,
        )

        is ProfileResult.ProfileLoaded -> previous.copy(
            isLoading = false,
            isGuest = false,
            displayName = result.displayName,
            email = result.email,
            tier = result.tier,
            subscriptions = result.subscriptions,
            error = null,
        )

        is ProfileResult.LoadError -> previous.copy(isLoading = false, error = result.message)

        is ProfileResult.ProductsLoaded -> previous.copy(products = result.products)
        is ProfileResult.PurchaseStarted -> previous.copy(isPurchasing = true)
        is ProfileResult.PurchaseSuccess -> previous.copy(isPurchasing = false, tier = "paid")
        is ProfileResult.PurchaseCancelled -> previous.copy(isPurchasing = false)
        is ProfileResult.PurchaseFailed -> previous.copy(isPurchasing = false)
        is ProfileResult.RestoreStarted -> previous.copy(isRestoring = true)
        is ProfileResult.RestoreSuccess -> previous.copy(isRestoring = false, tier = "paid")
        is ProfileResult.RestoreNothing -> previous.copy(isRestoring = false)
        is ProfileResult.RestoreFailed -> previous.copy(isRestoring = false)
    }
}
