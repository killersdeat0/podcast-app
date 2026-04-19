# Theme Switching — Design Spec

**Date:** 2026-04-18  
**Status:** Ready for implementation

## Overview

Replace the current fixed violet accent with a 4-theme system. Rose becomes the new default, making the app feel distinct from generic "AI purple" products. Users can switch themes freely from Settings. The change ships on both web and mobile with cross-device sync via Supabase.

Playback state indicators (progress bars, "Done" text, EQ bars) remain green (`#4ade80`) across all themes — they carry semantic meaning independent of the brand accent.

---

## Themes

| Name | Source color | Brand hex | Primary hex |
|---|---|---|---|
| Rose (default) | `#f43f5e` | `#f43f5e` | `#fda4af` |
| Amber | `#f59e0b` | `#f59e0b` | `#fcd34d` |
| Sky | `#0ea5e9` | `#0ea5e9` | `#7dd3fc` |
| Violet | `#7c3aed` | `#7c3aed` | `#a78bfa` |

Violet is the legacy default — kept so users who prefer it aren't disrupted.

---

## Web Implementation

### 1. Color tokens (`web/src/app/globals.css`)

The `:root` block becomes the Rose theme. Three `[data-theme]` blocks override the same ~7 variables for the other themes. All other tokens — surfaces, borders, green playback state, error, warning, scrim — are unchanged across themes.

Variables that change per theme:

```css
--md-primary
--md-on-primary
--md-primary-container
--md-on-primary-container
--md-brand
--md-brand-dark
--md-on-brand
```

Structure:

```css
:root {
  /* Rose — new default */
  --md-primary:               #fda4af;
  --md-on-primary:            #4c0519;
  --md-primary-container:     #9f1239;
  --md-on-primary-container:  #ffe4e6;
  --md-brand:                 #f43f5e;
  --md-brand-dark:            #e11d48;
  --md-on-brand:              #ffffff;
  /* ... all other tokens unchanged ... */
}

[data-theme="amber"] {
  --md-primary:               #fcd34d;
  --md-on-primary:            #451a03;
  --md-primary-container:     #92400e;
  --md-on-primary-container:  #fef3c7;
  --md-brand:                 #f59e0b;
  --md-brand-dark:            #d97706;
  --md-on-brand:              #ffffff;
}

[data-theme="sky"] {
  --md-primary:               #7dd3fc;
  --md-on-primary:            #082f49;
  --md-primary-container:     #075985;
  --md-on-primary-container:  #e0f2fe;
  --md-brand:                 #0ea5e9;
  --md-brand-dark:            #0284c7;
  --md-on-brand:              #ffffff;
}

[data-theme="violet"] {
  /* Current values — no change */
  --md-primary:               #a78bfa;
  --md-on-primary:            #1e0070;
  --md-primary-container:     #4f378b;
  --md-on-primary-container:  #eaddff;
  --md-brand:                 #7c3aed;
  --md-brand-dark:            #5b21b6;
  --md-on-brand:              #ffffff;
}
```

No component changes needed — all components already consume semantic tokens.

Before implementation: run a hardcoded color audit across `web/src/` to find any raw Tailwind palette classes (`bg-gray-*`, `text-violet-*`, `text-white`, etc.), inline hex/rgba style props, or banned opacity modifiers on semantic tokens (`bg-primary/10`). Replace each with the appropriate semantic token.

### 2. Flash prevention (`web/src/app/layout.tsx`)

Add an inline `<script>` at the top of `<body>` (before any React content) that reads localStorage and sets `document.documentElement.dataset.theme` synchronously. This runs before hydration so there is no flash of the wrong theme on load.

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `
      try {
        var t = localStorage.getItem('theme');
        if (t) document.documentElement.dataset.theme = t;
      } catch(e) {}
    `,
  }}
/>
```

### 3. Database

One migration:

```sql
ALTER TABLE user_profiles ADD COLUMN theme TEXT NOT NULL DEFAULT 'rose';
```

### 4. API (`web/src/app/api/profile/route.ts`)

Extend the existing `GET /api/profile` and `PATCH /api/profile` handlers to read and write the `theme` column alongside `default_volume`. No new routes.

`PATCH` body accepts `{ theme: 'rose' | 'amber' | 'sky' | 'violet' }`. Validate against the allowed set; return 400 on unknown value.

### 5. Theme context / hook

Add a `useTheme()` hook (or extend `UserContext`) that:
- On mount: reads theme from localStorage instantly, then reconciles with the value from `GET /api/profile` (DB is authoritative)
- On change: writes to `document.documentElement.dataset.theme`, localStorage, and `PATCH /api/profile`
- Guest users: localStorage only, no API call

### 6. Settings UI (`web/src/app/(app)/settings/page.tsx`)

Add an "Appearance" section with a row containing:
- Label: "Theme" / subtext: "Choose your accent color"
- 4 dot swatches (24px circles) for Rose, Amber, Sky, Violet
- Selected swatch: white border ring (`ring-2 ring-white`)
- Below the row: a mini preview strip showing the play button and progress bar in the active theme colors — updates instantly on swatch click

No save button — changes apply immediately.

### 7. Nav active state (`web/src/components/ui/Sidebar.tsx`)

Change the active nav item from solid fill to left-border + dim background. This reduces purple saturation regardless of theme and makes all themes feel less aggressive.

Current:
```
isActive ? 'bg-brand text-on-surface font-medium' : '...'
```

New:
```
isActive ? 'border-l-2 border-brand bg-surface-container text-on-surface font-medium pl-[calc(theme(spacing.3)-2px)]' : '...'
```

The `pl` adjustment compensates for the 2px border so text alignment stays consistent.

---

## Mobile Implementation

> **TODO:** Mobile implementation is tracked separately.
> See [`docs/superpowers/todos/2026-04-18-theme-switching-mobile-design.md`](../../todos/2026-04-18-theme-switching-mobile-design.md).

High-level: swap `MaterialTheme(colorScheme = ...)` at the Compose root based on a stored theme preference. Same 4 themes, same `user_profiles.theme` DB column, DataStore for fast local reads. Settings screen gets the same dot-swatch picker. No component changes needed beyond `theme/Theme.kt` and `settings/`.

---

## Constraints

- Playback green (`#4ade80`, `--md-playback-indicator`) is never theme-controlled — it carries semantic meaning
- No light mode in this spec — out of scope
- `--md-brand` and `--md-on-brand` values must pass WCAG AA contrast on `--md-surface` backgrounds
- Theme tokens must never be hardcoded in components — always consumed via semantic token utilities

---

## Files Changed (web)

- `web/src/app/globals.css` — add `[data-theme]` blocks, update `:root` to Rose
- `web/src/app/layout.tsx` — add flash-prevention inline script
- `web/src/app/(app)/settings/page.tsx` — add Appearance section with swatch picker
- `web/src/components/ui/Sidebar.tsx` — update nav active state style
- `web/src/lib/theme/useTheme.ts` — new hook
- `web/src/app/api/profile/route.ts` — extend to handle `theme` field
- `supabase/migrations/YYYYMMDD_add_theme_to_user_profiles.sql` — new migration

## Files Changed (mobile)

See [`docs/superpowers/todos/2026-04-18-theme-switching-mobile-design.md`](../../todos/2026-04-18-theme-switching-mobile-design.md).
