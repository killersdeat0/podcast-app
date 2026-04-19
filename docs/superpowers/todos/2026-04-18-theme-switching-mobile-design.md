# Theme Switching — Mobile Implementation Spec

**Date:** 2026-04-18  
**Status:** TODO — to be designed  
**Depends on:** [`docs/superpowers/specs/2026-04-18-theme-switching-design.md`](../specs/2026-04-18-theme-switching-design.md) (web spec, DB migration)

## Context

The web app ships theme switching first (4 themes: Rose, Amber, Sky, Violet). The mobile app (Compose Multiplatform) needs to implement the same feature using the same `user_profiles.theme` DB column so preferences sync cross-device.

This doc is a placeholder. Fill in the full design before starting mobile implementation.

---

## Known decisions (from web brainstorm)

- **4 themes:** Rose (default), Amber, Sky, Violet — same source colors as web
- **DB column:** `user_profiles.theme TEXT DEFAULT 'rose'` — already added by the web migration
- **Persistence:** DataStore for fast local reads; Supabase `user_profiles.theme` as authoritative cross-device store
- **Guest users:** DataStore only, no API call
- **Settings UI:** Dot swatches row — 4 colored circles, selected gets a white ring, applies instantly
- **No light mode** — out of scope for this feature
- **Playback green** (`Color(0xFF4ADE80)`) is never theme-controlled

---

## TODO: Design questions to answer

- [ ] How are the M3 `ColorScheme` objects generated? (`material-color-utilities` library, or manual from Material Theme Builder output?)
- [ ] Where exactly in `App.kt` / `AppShell.kt` does the `MaterialTheme(colorScheme = ...)` swap happen?
- [ ] Does `SettingsViewModel` own the theme state, or does it live in a new `ThemeViewModel` injected at the root?
- [ ] What is the DataStore schema? (key name, type, default)
- [ ] How does the profile fetch on launch interact with the local DataStore value? (which wins on conflict?)
- [ ] Does the swatch picker go in the existing Settings screen or a new Appearance sub-screen?
- [ ] Are there any hardcoded `Color(0xFF...)` values in existing Compose components that would break with a theme swap? (audit needed)

---

## Candidate files to change

All paths under `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/`:

| File | Change |
|---|---|
| `theme/Theme.kt` | Add `RoseColorScheme`, `AmberColorScheme`, `SkyColorScheme`, `VioletColorScheme` |
| `settings/SettingsViewModel.kt` | Add theme state + DataStore read/write |
| `settings/SettingsRepository.kt` | Add theme persistence (DataStore + Supabase) |
| `settings/SettingsScreen.kt` | Add swatch picker row |
| `profile/ProfileRepository.kt` | Include `theme` in profile fetch/save |
| `App.kt` | Pass resolved `ColorScheme` to `MaterialTheme` at root |
