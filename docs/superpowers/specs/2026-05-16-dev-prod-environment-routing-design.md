# Dev/Prod Environment Routing Design

**Date:** 2026-05-16
**Scope:** Mobile Android + iOS — fix environment selection so release builds always use PROD
**Status:** Approved

## Overview

The environment-switching infrastructure is already built (`DevSettingsFeature`, `SelectedEnvironment`, `DevSettingsRepository`, `DEV_*`/`PROD_*` BuildConfig fields, iOS Info.plist). Two bugs prevent it from working correctly, and the CI workflows are missing the prod credentials.

## Bugs to Fix

### Bug 1 — Android: release builds default to old `SUPABASE_URL` field

`Platform.android.kt` initializes `SelectedEnvironment` to `BuildConfig.SUPABASE_URL` / `BuildConfig.SUPABASE_ANON_KEY` — the old redundant field, which maps to dev keys. `MainActivity` only overrides `SelectedEnvironment` inside `if (BuildConfig.DEBUG)`, so release builds never get corrected and always point at DEV.

**Fix:** Initialize `SelectedEnvironment` based on `BuildConfig.DEBUG`:
```kotlin
object SelectedEnvironment {
    var url: String = if (BuildConfig.DEBUG) BuildConfig.DEV_SUPABASE_URL else BuildConfig.PROD_SUPABASE_URL
    var key: String = if (BuildConfig.DEBUG) BuildConfig.DEV_SUPABASE_ANON_KEY else BuildConfig.PROD_SUPABASE_ANON_KEY
}
```

`MainActivity`'s existing debug-only override (SharedPrefs → DEV or PROD) is unchanged and correct.

### Bug 2 — iOS: release binaries always use DEV

`PlatformModule.ios.kt` `initSelectedEnvironment()` uses:
```kotlin
val useProd = KNPlatform.isDebugBinary && env == "prod"
```
`isDebugBinary` is `false` for release builds, so `useProd` is always `false` in production — app always connects to DEV.

**Fix:**
```kotlin
val useProd = !KNPlatform.isDebugBinary || env == "prod"
```
Release binaries always use PROD. Debug binaries check the stored dev-settings pref.

## Cleanup

Remove the two old redundant `buildConfigField` entries from `android { defaultConfig }` in `composeApp/build.gradle.kts`:
- `SUPABASE_URL` (was `SYNCPODS_SUPABASE_URL`) — replaced by `DEV_SUPABASE_URL`
- `SUPABASE_ANON_KEY` (was `SYNCPODS_SUPABASE_ANON_KEY`) — replaced by `DEV_SUPABASE_ANON_KEY`

These fields are now unreferenced after Bug 1 is fixed.

## CI Workflow Updates

Both `mobile-ci.yml` and `mobile-release.yml` write `local.properties` before invoking Gradle. All four `buildConfigField` entries (`DEV_*` and `PROD_*`) are compiled into every build variant, so the `local.properties` write step must include:

```
SYNCPODS_PROD_SUPABASE_URL=<value>
SYNCPODS_PROD_SUPABASE_ANON_KEY=<value>
```

Two new GitHub Secrets required: `SYNCPODS_PROD_SUPABASE_URL`, `SYNCPODS_PROD_SUPABASE_ANON_KEY`.

`local.properties` locally already has both prod keys — no local change needed.

## Files Changed

| File | Change |
|---|---|
| `composeApp/src/androidMain/.../Platform.android.kt` | Fix `SelectedEnvironment` default (Bug 1) |
| `composeApp/src/iosMain/.../di/PlatformModule.ios.kt` | Fix `initSelectedEnvironment()` logic (Bug 2) |
| `composeApp/build.gradle.kts` | Remove old `SUPABASE_URL` + `SUPABASE_ANON_KEY` buildConfigFields |
| `.github/workflows/mobile-ci.yml` | Add prod credentials to `local.properties` write step |
| `.github/workflows/mobile-release.yml` | Add prod credentials to `local.properties` write step |

## Behavior After Fix

| Build | Platform | Endpoint |
|---|---|---|
| Debug | Android | DEV (default) or PROD (if user toggled in Dev Settings) |
| Release | Android | PROD always |
| Debug binary | iOS | DEV (default) or PROD (if user toggled in Dev Settings) |
| Release binary | iOS | PROD always |

## Out of Scope

- `DevSettingsRepository.Environment.host` hardcoded values — informational only, not used for URL selection
- Adding new Dev Settings UI features
- iOS xcconfig-based secret management (Info.plist already has both keys hardcoded)
