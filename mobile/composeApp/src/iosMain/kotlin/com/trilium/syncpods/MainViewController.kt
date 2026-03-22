package com.trilium.syncpods

import androidx.compose.ui.window.ComposeUIViewController
import com.trilium.syncpods.di.appModule
import org.koin.core.context.startKoin

private var koinStarted = false

fun MainViewController() = run {
    if (!koinStarted) {
        startKoin { modules(appModule) }
        koinStarted = true
    }
    ComposeUIViewController { App() }
}
