# Theming

SyncPods uses **Material3 (M3)** as its design token vocabulary across both web and mobile. The source color is `#7c3aed` (violet-600).

To regenerate the full palette from scratch: [Material Theme Builder](https://material-foundation.github.io/material-theme-builder/) → export CSS + Compose.

---

## Web (Next.js / Tailwind v4)

Color roles are defined as `--md-*` CSS custom properties in `web/src/app/globals.css`, then exposed as Tailwind utilities via the `@theme inline` block.

```css
/* globals.css */
:root {
  --md-primary: #cfb8ff;
  --md-surface: #141218;
  /* ... */
}

@theme inline {
  --color-primary: var(--md-primary);
  --color-surface: var(--md-surface);
  /* ... */
}
```

This generates Tailwind utilities for every role:

| Role | Tailwind class |
|---|---|
| Primary accent | `bg-primary` / `text-primary` |
| App background | `bg-background` |
| Default surface | `bg-surface` |
| Cards / sheets | `bg-surface-container` / `bg-surface-container-high` |
| Subdued text | `text-on-surface-variant` |
| Error | `text-error` / `bg-error-container` |
| Borders | `border-outline` / `border-outline-variant` |

Prefer semantic tokens over raw Tailwind palette classes (`bg-surface` not `bg-gray-950`, `text-primary` not `text-violet-400`).

---

## Mobile (Compose Multiplatform)

`mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/theme/Theme.kt` defines `SyncPodsTheme`, a thin wrapper around `MaterialTheme` with a custom `darkColorScheme`.

```kotlin
// In any screen's root composable — already applied at App.kt level
SyncPodsTheme {
    // MaterialTheme.colorScheme.primary, .surface, etc. are now the M3 violet palette
}
```

Use `MaterialTheme.colorScheme.*` for all colors in Composables — never hardcode hex values.

---

## Shared color roles (both platforms)

| Role | Web token | Mobile |
|---|---|---|
| Primary brand | `bg-primary` | `colorScheme.primary` |
| On-primary text | `text-on-primary` | `colorScheme.onPrimary` |
| Primary container | `bg-primary-container` | `colorScheme.primaryContainer` |
| App background | `bg-background` | `colorScheme.background` |
| Surface | `bg-surface` | `colorScheme.surface` |
| Elevated surface | `bg-surface-container-high` | `colorScheme.surfaceContainerHigh` |
| Body text | `text-on-surface` | `colorScheme.onSurface` |
| Subdued text | `text-on-surface-variant` | `colorScheme.onSurfaceVariant` |
| Borders | `border-outline` | `colorScheme.outline` |
| Error | `text-error` | `colorScheme.error` |

---

## Adding a light theme later

Web: wrap the `--md-*` variables in a `[data-theme="light"]` selector and use `next-themes` to toggle the attribute.

Mobile: pass a `lightColorScheme` to `SyncPodsTheme` based on `isSystemInDarkTheme()`.
