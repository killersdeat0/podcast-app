package com.trilium.syncpods.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class QueueViewModel(repository: QueueRepository) : ViewModel() {
    val feature = QueueFeature(viewModelScope + Dispatchers.Default, repository)
}
