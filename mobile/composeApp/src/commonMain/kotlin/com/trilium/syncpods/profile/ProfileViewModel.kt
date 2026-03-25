package com.trilium.syncpods.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class ProfileViewModel(repository: ProfileRepository) : ViewModel() {
    val feature = ProfileFeature(viewModelScope + Dispatchers.Default, repository)
}
