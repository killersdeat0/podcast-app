package com.trilium.syncpods.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class SignUpViewModel(repository: LoginRepository) : ViewModel() {
    val feature = SignUpFeature(viewModelScope + Dispatchers.Default, repository)
}
