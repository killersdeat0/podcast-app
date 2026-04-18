package com.trilium.syncpods.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class ForgotPasswordViewModel(repository: LoginRepository) : ViewModel() {
    val feature = ForgotPasswordFeature(viewModelScope + Dispatchers.Default, repository)
}
