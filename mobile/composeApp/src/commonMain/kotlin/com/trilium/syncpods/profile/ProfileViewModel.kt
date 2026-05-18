package com.trilium.syncpods.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trilium.syncpods.billing.BillingRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class ProfileViewModel(
    repository: ProfileRepository,
    billingRepository: BillingRepository,
) : ViewModel() {
    val feature = ProfileFeature(viewModelScope + Dispatchers.Default, repository, billingRepository)
}
