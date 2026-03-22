package com.trilium.syncpods

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.trilium.syncpods.shell.AppShell
import com.trilium.syncpods.theme.SyncPodsTheme

@Composable
@Preview
fun App() {
    SyncPodsTheme {
        AppShell()
    }
}
