package com.trilium.syncpods.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Source color: #7c3aed (violet-600)
// Generated with Material3 tonal palette derivation (dark scheme)
// To regenerate: https://material-foundation.github.io/material-theme-builder/
private val DarkColorScheme = darkColorScheme(
    primary             = Color(0xFFCFB8FF),
    onPrimary           = Color(0xFF381E72),
    primaryContainer    = Color(0xFF4F378B),
    onPrimaryContainer  = Color(0xFFEADDFF),

    secondary           = Color(0xFFCBC2DB),
    onSecondary         = Color(0xFF332D41),
    secondaryContainer  = Color(0xFF4A4458),
    onSecondaryContainer = Color(0xFFE8DEF8),

    tertiary            = Color(0xFFEFB8C8),
    onTertiary          = Color(0xFF492532),
    tertiaryContainer   = Color(0xFF633B48),
    onTertiaryContainer = Color(0xFFFFD8E4),

    error               = Color(0xFFFFB4AB),
    onError             = Color(0xFF690005),
    errorContainer      = Color(0xFF93000A),
    onErrorContainer    = Color(0xFFFFDAD6),

    background          = Color(0xFF141218),
    onBackground        = Color(0xFFE6E1E5),

    surface             = Color(0xFF141218),
    onSurface           = Color(0xFFE6E1E5),
    surfaceVariant      = Color(0xFF49454F),
    onSurfaceVariant    = Color(0xFFCAC4D0),

    outline             = Color(0xFF938F99),
    outlineVariant      = Color(0xFF49454F),

    surfaceContainerLowest  = Color(0xFF0F0D13),
    surfaceContainerLow     = Color(0xFF1D1B20),
    surfaceContainer        = Color(0xFF211F26),
    surfaceContainerHigh    = Color(0xFF2B2930),
    surfaceContainerHighest = Color(0xFF36343B),
)

@Composable
fun SyncPodsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content,
    )
}
