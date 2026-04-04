package com.trilium.syncpods.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class SettingsViewModel(repo: SettingsRepository) : ViewModel() {
    val feature = SettingsFeature(viewModelScope + Dispatchers.Default, repo)
}
