# Theming

SyncPods uses **Material3 (M3)** as its design token vocabulary across both web and mobile. The source color is `#7c3aed` (violet-600).

To regenerate the full palette from scratch: [Material Theme Builder](https://material-foundation.github.io/material-theme-builder/) → export CSS + Compose.

---

## Web (Next.js / Tailwind v4)

Color roles are defined as `--md-*` CSS custom properties in `web/src/app/globals.css`, then exposed as Tailwind utilities via the `@theme inline` block.

```css
/* globals.css */
:root {
  --md-primary: #fda4af;  /* rose-300 (default theme) — text accents only */
  --md-surface: #030712;
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
| Modal backdrop | `bg-scrim` |
| Warning banners | `bg-warning-container` / `text-on-warning-container` |

**Surface token values** (tuned to match the original gray scale, not the M3 generated values):

| Token | Value | Replaces |
|---|---|---|
| `bg-background` | `#030712` | `bg-gray-950` |
| `bg-surface-container-low` | `#111827` | `bg-gray-900` (cards, panels) |
| `bg-surface-container` | `#1f2937` | `bg-gray-800` (popovers, dropdowns) |
| `bg-surface-container-high` | `#374151` | `bg-gray-700` (hover states) |
| `text-on-surface` | `#ffffff` | `text-white` |
| `text-on-surface-variant` | `#9ca3af` | `text-gray-400` (metadata, subtitles) |
| `text-on-surface-dim` | `#6b7280` | `text-gray-500`/`text-gray-600` (timestamps, section labels, drag handles) |
| `border-outline-variant` | `#374151` | `border-gray-700`/`border-gray-800` |

**Brand tokens** (vivid violet fills — distinct from the M3 `primary` role which is for text):

| Token | Value | Usage |
|---|---|---|
| `bg-brand` / `text-brand` | `#7c3aed` | Filled buttons, active nav pill, badges — replaces `bg-violet-600` |
| `hover:bg-brand-dark` | `#5b21b6` | Hover state on brand fills and slider accent |
| `text-primary` | `#a78bfa` | Violet accent text — replaces `text-violet-400` |
| `accent-brand` | `#7c3aed` | `input[type=range]` slider track color |

**App-specific tokens** (custom extensions to M3, defined in `globals.css`):

| Token | Usage |
|---|---|
| `bg-now-playing-surface` | Purple row tint for the currently-playing episode |
| `bg-playback-fill` / `bg-playback-active-fill` | Translucent green progress background (inactive / active) |
| `bg-playback-indicator` / `text-playback-indicator` | Solid green for progress bars, "Done" text, success checks |
| `bg-scrim` | Semi-transparent black backdrop behind modals |
| `bg-warning-container` / `text-on-warning-container` / `text-warning` | Yellow warning banners (e.g. over-limit notices) |

**Rule:** never use raw Tailwind palette classes (`bg-gray-*`, `text-violet-*`, `text-white`, `bg-black/60`, etc.) in components. If a color isn't covered by an existing token, add `--md-*` to `:root` and `--color-*` to `@theme inline` in `globals.css` first.

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

## Theme switching (web)

The active theme is stored in `localStorage` under the key `'theme'`. Valid values: `'rose'` (default), `'amber'`, `'sky'`, `'violet'`.

Themes are applied by setting `document.documentElement.dataset.theme` to the stored value. The `:root` CSS defines the rose palette, and `[data-theme="amber"]` / `[data-theme="sky"]` / `[data-theme="violet"]` selectors in `globals.css` override the `--md-*` tokens. When the theme is `'rose'` (or absent), no attribute is set — rose is the CSS default.

### Flash-of-wrong-theme prevention

`web/src/app/layout.tsx` injects an inline `<script>` as the **first child of `<body>`** — before React hydrates — to restore the stored theme attribute synchronously:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `try{var t=localStorage.getItem('theme');if(t&&t!=='rose')document.documentElement.dataset.theme=t}catch(e){}`,
  }}
/>
```

This is the standard FOWT-prevention pattern. The `try/catch` guards against environments where `localStorage` is unavailable (e.g. private-browsing restrictions). No external library (e.g. `next-themes`) is used — the script is intentionally minimal.

### Adding a new theme

1. Add a `[data-theme="<name>"]` block to `globals.css` overriding the `--md-*` tokens.
2. Add `'<name>'` to the `Theme` type in `src/lib/theme.ts` (or equivalent).
3. Add an entry to the theme picker UI in Settings.
4. No changes to `layout.tsx` are needed — the script reads whatever is in localStorage.

---

## Adding a light theme later

Web: wrap the `--md-*` variables in a `[data-theme="light"]` selector and use `next-themes` to toggle the attribute.

Mobile: pass a `lightColorScheme` to `SyncPodsTheme` based on `isSystemInDarkTheme()`.
