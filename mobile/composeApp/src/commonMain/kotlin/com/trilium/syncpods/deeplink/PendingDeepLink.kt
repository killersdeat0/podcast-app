package com.trilium.syncpods.deeplink

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PendingDeepLink {
    private val _route = MutableStateFlow<String?>(null)
    val route: StateFlow<String?> = _route.asStateFlow()

    fun set(route: String) {
        _route.value = route
    }

    fun consume() {
        _route.value = null
    }
}
