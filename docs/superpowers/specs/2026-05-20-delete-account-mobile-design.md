# Delete Account — Mobile (Settings Screen)

**Date:** 2026-05-20  
**Scope:** Add "Delete Account" option to the mobile Settings screen. Tapping it shows a native confirmation dialog, then opens `syncpods.app/settings` in the system browser where the user completes deletion via the existing web UI.

---

## Approach

Browser redirect (Option A). No new backend endpoint or Edge Function required. The web app's `/settings` page already handles account deletion including Stripe subscription cancellation.

---

## Changes

### `SettingsFeature.kt`

- **New event:** `DeleteAccountTapped`
- **New action:** `NavigateToDeleteAccount`
- **New effect:** `OpenDeleteAccountPage`
- Mapping: `DeleteAccountTapped → NavigateToDeleteAccount → emit(OpenDeleteAccountPage)` via `_effects`. No result or state change needed — it is a pure navigation side effect.

### `SettingsScreen.kt`

- **New composable:** `DeleteAccountRow` — styled like `SignOutRow` (error color, no chevron), placed below Sign Out, only visible when `state.isSignedIn`.
- **Local dialog state:** `var showDeleteConfirmDialog by remember { mutableStateOf(false) }` — UI-only, not lifted into the feature.
- **Confirmation `AlertDialog`:**
  - Title: "Delete Account"
  - Text: "This will permanently delete your account and all your data. You'll be taken to the website to complete the process."
  - Buttons: "Cancel" (dismiss) and "Continue" (fires `DeleteAccountTapped`)
- **Effect collection:** `OpenDeleteAccountPage` → `LocalUriHandler.current.openUri("https://syncpods.app/settings")`

---

## What is not changing

- `SettingsRepository` — no new method needed.
- `SettingsState` — no new fields; dialog visibility is local UI state.
- No new expect/actual, no new Edge Function, no new Supabase calls.

---

## Placement in Settings list

```
PREFERENCES
  Notification Settings
  Playback Defaults
─────────────────────────
DATA & ACCOUNT
  OPML Import/Export
  Manage Subscription
  Sign Out              ← existing (signed-in only)
  Delete Account        ← new (signed-in only, below Sign Out)
```
