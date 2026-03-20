package com.trilium.syncpods

import androidx.compose.ui.window.ComposeUIViewController
import com.trilium.syncpods.di.appModule
import org.koin.core.context.GlobalContext
import org.koin.core.context.startKoin

fun MainViewController() = ComposeUIViewController { App() }.also {
    if (GlobalContext.getOrNull() == null) {
        startKoin { modules(appModule) }
    }
}
