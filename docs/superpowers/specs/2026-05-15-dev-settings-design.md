# Dev Settings Screen — Design Spec

**Date:** 2026-05-15  
**Status:** Approved

## Overview

Add a Developer Settings screen to the mobile app (debug builds only) that lets developers switch the Supabase backend between the dev and prod environments. Switching force-closes the app; on next launch Koin initializes with the newly selected credentials.

## Access Pattern

Long-pressing the version string at the bottom of the existing Settings screen navigates to the Developer Settings screen. A subtle "long-press to open dev tools" hint is shown below the version text. Both the hint and the navigation destination are gated by `isDebug` and are absent from release builds.

## UI

Full-screen navigation destination (not a sheet). Layout:

- Top app bar: "Developer Settings" title + a red `DEBUG` badge chip
- **BACKEND ENVIRONMENT** section — two cards:
  - Active environment: highlighted with green border + "ACTIVE" badge, shows host URL
  - Inactive environment: tappable card, shows host URL
- Warning banner: "Switching restarts the app. Your current session will be lost."
- "Switch to [other env] & Restart" button — enabled only when `selectedEnvironment ≠ activeEnvironment`

## UDF Pipeline

```
DevSettingsEvent.ScreenVisible
  → DevSettingsAction.LoadEnvironment
  → repo.getActiveEnvironment()
  → DevSettingsResult.EnvironmentLoaded(env)
  → state.copy(activeEnvironment = env, selectedEnvironment = env)

DevSettingsEvent.EnvironmentTapped(env)
  → DevSettingsAction.SelectEnvironment(env)
  → DevSettingsResult.EnvironmentSelected(env)
  → state.copy(selectedEnvironment = env)

DevSettingsEvent.SwitchAndRestartTapped
  → DevSettingsAction.CommitAndRestart(state.selectedEnvironment)
  → repo.saveEnvironment(env)  [no Result emitted]
  → emits DevSettingsEffect.RestartApp
  → Screen collects effect → calls exitProcess(0)
```

### Types

```kotlin
data class DevSettingsState(
    val activeEnvironment: Environment = Environment.DEV,
    val selectedEnvironment: Environment = Environment.DEV,
)

enum class Environment(val displayName: String, val host: String) {
    DEV("Development",  "nuvadoybccdqipyhdhns.supabase.co"),
    PROD("Production",  "dqqybduklxwxtcahqswh.supabase.co"),
}

sealed class DevSettingsEvent {
    data object ScreenVisible : DevSettingsEvent()
    data class EnvironmentTapped(val environment: Environment) : DevSettingsEvent()
    data object SwitchAndRestartTapped : DevSettingsEvent()
}

sealed class DevSettingsAction {
    data object LoadEnvironment : DevSettingsAction()
    data class SelectEnvironment(val environment: Environment) : DevSettingsAction()
    data class CommitAndRestart(val environment: Environment) : DevSettingsAction()
}

sealed class DevSettingsResult {
    data class EnvironmentLoaded(val environment: Environment) : DevSettingsResult()
    data class EnvironmentSelected(val environment: Environment) : DevSettingsResult()
}

sealed class DevSettingsEffect {
    data object RestartApp : DevSettingsEffect()
}
```

## Credential Storage and Startup

### local.properties (two new entries)

```properties
SYNCPODS_PROD_SUPABASE_URL=https://dqqybduklxwxtcahqswh.supabase.co
SYNCPODS_PROD_SUPABASE_ANON_KEY=<prod anon key>
```

### build.gradle.kts — debug-only BuildConfig fields

```kotlin
debug {
    buildConfigField("String", "DEV_SUPABASE_URL",       "\"${localProperties["SYNCPODS_SUPABASE_URL"] ?: ""}\"")
    buildConfigField("String", "DEV_SUPABASE_ANON_KEY",  "\"${localProperties["SYNCPODS_SUPABASE_ANON_KEY"] ?: ""}\"")
    buildConfigField("String", "PROD_SUPABASE_URL",      "\"${localProperties["SYNCPODS_PROD_SUPABASE_URL"] ?: ""}\"")
    buildConfigField("String", "PROD_SUPABASE_ANON_KEY", "\"${localProperties["SYNCPODS_PROD_SUPABASE_ANON_KEY"] ?: ""}\"")
}
```

Release builds do not receive these fields. `BuildConfig.SUPABASE_URL` (injected by CI) remains the sole credential in release APKs.

### Android startup wiring

`androidMain` declares a `SelectedEnvironment` object defaulting to dev values:

```kotlin
object SelectedEnvironment {
    var url: String = BuildConfig.SUPABASE_URL
    var key: String = BuildConfig.SUPABASE_ANON_KEY
}
```

`MainActivity.onCreate()`, before `startKoin`:

```kotlin
if (BuildConfig.DEBUG) {
    val prefs = getSharedPreferences("dev_settings", Context.MODE_PRIVATE)
    val env = prefs.getString("dev_settings_env", "dev")
    SelectedEnvironment.url = if (env == "prod") BuildConfig.PROD_SUPABASE_URL else BuildConfig.DEV_SUPABASE_URL
    SelectedEnvironment.key = if (env == "prod") BuildConfig.PROD_SUPABASE_ANON_KEY else BuildConfig.DEV_SUPABASE_ANON_KEY
}
```

`PlatformModule.android.kt` actuals delegate to `SelectedEnvironment`:

```kotlin
actual val supabaseUrl: String get() = SelectedEnvironment.url
actual val supabaseAnonKey: String get() = SelectedEnvironment.key
```

### iOS startup wiring

Identical pattern in `iosMain` using `NSUserDefaults.standardUserDefaults` and an equivalent `SelectedEnvironment` object. `generateIosSecrets` Gradle task extended to write `PROD_SUPABASE_URL` and `PROD_SUPABASE_ANON_KEY` to `Secrets.xcconfig`; `Info.plist` exposes them; `PlatformModule.ios.kt` reads them via `NSBundle`.

### DevSettingsRepository

```kotlin
interface DevSettingsRepository {
    fun getActiveEnvironment(): Environment
    fun saveEnvironment(environment: Environment)
}

class DevSettingsRepositoryImpl(private val settings: Settings) : DevSettingsRepository {
    override fun getActiveEnvironment(): Environment {
        val value = settings.getStringOrNull("dev_settings_env") ?: "dev"
        return if (value == "prod") Environment.PROD else Environment.DEV
    }
    override fun saveEnvironment(environment: Environment) {
        settings.putString("dev_settings_env", environment.name.lowercase())
    }
}
```

Uses the `Settings` singleton already registered in Koin. The storage key `"dev_settings_env"` is the same key that `MainActivity`/`MainViewController` read before Koin starts.

## Platform-Specific Details

### isDebug expect/actual

Added to existing `Platform.kt`:

```kotlin
// commonMain
expect val isDebug: Boolean

// androidMain
actual val isDebug: Boolean get() = BuildConfig.DEBUG

// iosMain
actual val isDebug: Boolean get() = Platform.isDebugBinary
```

### Force-close

`kotlin.system.exitProcess(0)` called in `DevSettingsScreen` when the `RestartApp` effect is collected. Available in commonMain — no expect/actual needed.

## Files Changed / Created

| File | Change |
|------|--------|
| `commonMain/devsettings/DevSettingsFeature.kt` | New — full UDF pipeline |
| `commonMain/devsettings/DevSettingsScreen.kt` | New — Composable |
| `commonMain/devsettings/DevSettingsViewModel.kt` | New — thin ViewModel |
| `commonMain/devsettings/DevSettingsRepository.kt` | New — interface + `DevSettingsRepositoryImpl` |
| `commonMain/Platform.kt` | Add `expect val isDebug: Boolean` |
| `androidMain/Platform.android.kt` | Add `actual val isDebug` + `SelectedEnvironment` object |
| `iosMain/Platform.ios.kt` | Add `actual val isDebug` |
| `androidMain/di/PlatformModule.android.kt` | `supabaseUrl`/`supabaseAnonKey` delegate to `SelectedEnvironment` |
| `iosMain/di/PlatformModule.ios.kt` | Add `SelectedEnvironment` object; actuals delegate to it |
| `androidMain/MainActivity.kt` | Init `SelectedEnvironment` before `startKoin` |
| `iosMain/MainViewController.kt` | Init `SelectedEnvironment` before Koin |
| `commonMain/navigation/AppRoutes.kt` | Add `DevSettings` route |
| `commonMain/shell/AppShell.kt` | Register DevSettings nav destination, gated by `if (isDebug)` |
| `commonMain/di/AppModule.kt` | Register `DevSettingsViewModel` + `DevSettingsRepository`, gated by `if (isDebug)` |
| `commonMain/settings/SettingsScreen.kt` | Long-press on version text, gated by `isDebug` |
| `composeApp/build.gradle.kts` | Debug BuildConfig fields; extend `generateIosSecrets` |
| `local.properties` | Add `SYNCPODS_PROD_SUPABASE_URL` + `SYNCPODS_PROD_SUPABASE_ANON_KEY` |

## Out of Scope

- Any dev settings other than environment switching
- Release build access to the dev settings screen
- Network request logging, feature flags, or other debug tooling
