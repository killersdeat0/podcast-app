package com.trilium.syncpods

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.request.crossfade
import coil3.util.DebugLogger
import com.trilium.syncpods.shell.AppShell
import com.trilium.syncpods.theme.SyncPodsTheme

@Composable
@Preview
fun App() {
    setSingletonImageLoaderFactory { context ->
        ImageLoader.Builder(context)
            .logger(DebugLogger())
            .crossfade(true)
            .build()
    }
    SyncPodsTheme {
        AppShell()
    }
}
