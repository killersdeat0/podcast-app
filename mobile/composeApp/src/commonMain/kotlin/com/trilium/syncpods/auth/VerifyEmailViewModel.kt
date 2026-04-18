package com.trilium.syncpods.auth

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.ktor.http.decodeURLPart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.plus

class VerifyEmailViewModel(
    savedStateHandle: SavedStateHandle,
    repository: LoginRepository,
    authSessionFlow: Flow<Unit>,
) : ViewModel() {
    private val email = (savedStateHandle.get<String>("email") ?: "").decodeURLPart()
    val feature = VerifyEmailFeature(viewModelScope + Dispatchers.Default, repository, email, authSessionFlow)
}
