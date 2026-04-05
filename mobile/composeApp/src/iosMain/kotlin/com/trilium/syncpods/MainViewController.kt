package com.trilium.syncpods

import androidx.compose.ui.window.ComposeUIViewController
import com.trilium.syncpods.di.appModule
import io.github.jan.supabase.SupabaseClient
import org.koin.core.context.startKoin

private var koinStarted = false

fun MainViewController() = run {
    if (!koinStarted) {
        val koin = startKoin { modules(appModule) }.koin
        initAuthDeepLinkHandler(koin.get<SupabaseClient>())
        koinStarted = true
    }
    ComposeUIViewController { App() }
}
