package com.trilium.syncpods.devsettings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class DevSettingsViewModel(repo: DevSettingsRepository) : ViewModel() {
    val feature = DevSettingsFeature(viewModelScope + Dispatchers.Default, repo)
}
