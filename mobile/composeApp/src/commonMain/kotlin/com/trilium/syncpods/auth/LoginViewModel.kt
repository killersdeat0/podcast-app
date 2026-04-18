package com.trilium.syncpods.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class LoginViewModel(repository: LoginRepository) : ViewModel() {
    val feature = LoginFeature(viewModelScope + Dispatchers.Default, repository)
}
