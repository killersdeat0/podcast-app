# Dev Settings Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a debug-only Developer Settings screen accessible via long-press on the version string in Settings, allowing the Supabase backend environment (dev vs prod) to be switched at runtime with a force-close restart.

**Architecture:** A `SelectedEnvironment` holder object in each platform source set is populated before Koin starts (in `MainActivity`/`MainViewController`), then read by the `supabaseUrl`/`supabaseAnonKey` actuals and `createSupabaseClient()` during Koin graph construction. `DevSettingsRepository` (backed by the existing `Settings` Koin singleton) persists the selection across restarts. The UI follows the standard UDF pipeline: `DevSettingsFeature` → `DevSettingsViewModel` → `DevSettingsScreen`.

**Tech Stack:** Kotlin Multiplatform, Compose Multiplatform, Koin, multiplatform-settings (`com.russhwolf.settings`), Supabase KMP SDK, AndroidX Navigation Compose

---

### Task 1: Add prod credentials to local.properties and build.gradle.kts

**Files:**
- Modify: `mobile/local.properties`
- Modify: `mobile/composeApp/build.gradle.kts`

> Note: The four credential BuildConfig fields (`DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY`, `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY`) must be added to `defaultConfig` (not just `debug {}`) because `MainActivity.kt` lives in `androidMain` and references them at compile time in both build types. They are anon keys and safe to include in release APKs; the `if (BuildConfig.DEBUG)` guard prevents them from being used at runtime in release.

- [ ] **Step 1: Add prod credentials to local.properties**

Open `mobile/local.properties` and append:

```properties
SYNCPODS_PROD_SUPABASE_URL=https://dqqybduklxwxtcahqswh.supabase.co
SYNCPODS_PROD_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcXliZHVrbHh3eHRjYWhxc3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzg1NTUsImV4cCI6MjA4OTgxNDU1NX0.FjWqyS1H5Ywsq8CpgI_8_8Ve7HoBo5jOTNmsbxxNZGs
```

- [ ] **Step 2: Add four credential BuildConfig fields to defaultConfig in build.gradle.kts**

In `mobile/composeApp/build.gradle.kts`, inside `android { defaultConfig { ... } }`, add four lines after the existing `buildConfigField` entries:

```kotlin
buildConfigField("String", "DEV_SUPABASE_URL", "\"${localProperties["SYNCPODS_SUPABASE_URL"] ?: project.findProperty("SYNCPODS_SUPABASE_URL") ?: ""}\"")
buildConfigField("String", "DEV_SUPABASE_ANON_KEY", "\"${localProperties["SYNCPODS_SUPABASE_ANON_KEY"] ?: project.findProperty("SYNCPODS_SUPABASE_ANON_KEY") ?: ""}\"")
buildConfigField("String", "PROD_SUPABASE_URL", "\"${localProperties["SYNCPODS_PROD_SUPABASE_URL"] ?: project.findProperty("SYNCPODS_PROD_SUPABASE_URL") ?: ""}\"")
buildConfigField("String", "PROD_SUPABASE_ANON_KEY", "\"${localProperties["SYNCPODS_PROD_SUPABASE_ANON_KEY"] ?: project.findProperty("SYNCPODS_PROD_SUPABASE_ANON_KEY") ?: ""}\"")
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add mobile/local.properties mobile/composeApp/build.gradle.kts
git commit -m "build: add prod Supabase credentials and debug BuildConfig fields"
```

---

### Task 2: Add `isDebug` expect/actual

**Files:**
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/Platform.kt`
- Modify: `mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/Platform.android.kt`
- Modify: `mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/Platform.ios.kt`

- [ ] **Step 1: Add expect declaration to Platform.kt**

```kotlin
package com.trilium.syncpods

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform

expect val isDebug: Boolean
```

- [ ] **Step 2: Add actual to Platform.android.kt**

```kotlin
package com.trilium.syncpods

import android.os.Build

class AndroidPlatform : Platform {
    override val name: String = "Android ${Build.VERSION.SDK_INT}"
}

actual fun getPlatform(): Platform = AndroidPlatform()

actual val isDebug: Boolean get() = BuildConfig.DEBUG
```

- [ ] **Step 3: Add actual to Platform.ios.kt**

```kotlin
package com.trilium.syncpods

import platform.UIKit.UIDevice
import kotlin.native.Platform as KNPlatform

class IOSPlatform : Platform {
    override val name: String = UIDevice.currentDevice.systemName() + " " + UIDevice.currentDevice.systemVersion
}

actual fun getPlatform(): Platform = IOSPlatform()

actual val isDebug: Boolean get() = KNPlatform.isDebugBinary
```

- [ ] **Step 4: Verify build**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/Platform.kt \
        mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/Platform.android.kt \
        mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/Platform.ios.kt
git commit -m "feat: add isDebug expect/actual to Platform"
```

---

### Task 3: DevSettingsRepository — test then implement

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsRepository.kt`
- Create: `mobile/composeApp/src/commonTest/kotlin/com/trilium/syncpods/devsettings/DevSettingsRepositoryTest.kt`

- [ ] **Step 1: Write the failing tests**

Create `mobile/composeApp/src/commonTest/kotlin/com/trilium/syncpods/devsettings/DevSettingsRepositoryTest.kt`:

```kotlin
package com.trilium.syncpods.devsettings

import com.russhwolf.settings.MapSettings
import kotlin.test.Test
import kotlin.test.assertEquals

class DevSettingsRepositoryTest {

    @Test
    fun `getActiveEnvironment returns DEV when nothing saved`() {
        val repo = DevSettingsRepositoryImpl(MapSettings())
        assertEquals(Environment.DEV, repo.getActiveEnvironment())
    }

    @Test
    fun `getActiveEnvironment returns PROD after saving PROD`() {
        val settings = MapSettings()
        val repo = DevSettingsRepositoryImpl(settings)
        repo.saveEnvironment(Environment.PROD)
        assertEquals(Environment.PROD, repo.getActiveEnvironment())
    }

    @Test
    fun `getActiveEnvironment returns DEV after saving DEV`() {
        val settings = MapSettings()
        val repo = DevSettingsRepositoryImpl(settings)
        repo.saveEnvironment(Environment.PROD)
        repo.saveEnvironment(Environment.DEV)
        assertEquals(Environment.DEV, repo.getActiveEnvironment())
    }
}
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.devsettings.DevSettingsRepositoryTest"
```

Expected: FAIL — `DevSettingsRepositoryImpl` and `Environment` not found.

- [ ] **Step 3: Implement DevSettingsRepository**

Create `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsRepository.kt`:

```kotlin
package com.trilium.syncpods.devsettings

import com.russhwolf.settings.Settings

enum class Environment(val displayName: String, val host: String) {
    DEV("Development", "nuvadoybccdqipyhdhns.supabase.co"),
    PROD("Production", "dqqybduklxwxtcahqswh.supabase.co"),
}

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

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.devsettings.DevSettingsRepositoryTest"
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsRepository.kt \
        mobile/composeApp/src/commonTest/kotlin/com/trilium/syncpods/devsettings/DevSettingsRepositoryTest.kt
git commit -m "feat: add DevSettingsRepository with Environment enum"
```

---

### Task 4: DevSettingsFeature — test then implement

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsFeature.kt`
- Create: `mobile/composeApp/src/commonTest/kotlin/com/trilium/syncpods/devsettings/DevSettingsFeatureTest.kt`

- [ ] **Step 1: Write the failing tests**

Create `mobile/composeApp/src/commonTest/kotlin/com/trilium/syncpods/devsettings/DevSettingsFeatureTest.kt`:

```kotlin
package com.trilium.syncpods.devsettings

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

private class FakeDevSettingsRepository(
    private var stored: Environment = Environment.DEV,
) : DevSettingsRepository {
    override fun getActiveEnvironment(): Environment = stored
    override fun saveEnvironment(environment: Environment) { stored = environment }
}

class DevSettingsFeatureTest {

    @Test
    fun `ScreenVisible loads active environment into state`() = runTest {
        val repo = FakeDevSettingsRepository(stored = Environment.PROD)
        val feature = DevSettingsFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial DevSettingsState()
            feature.process(DevSettingsEvent.ScreenVisible)
            val loaded = awaitItem()
            assertEquals(Environment.PROD, loaded.activeEnvironment)
            assertEquals(Environment.PROD, loaded.selectedEnvironment)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `EnvironmentTapped updates selectedEnvironment but not activeEnvironment`() = runTest {
        val repo = FakeDevSettingsRepository(stored = Environment.DEV)
        val feature = DevSettingsFeature(backgroundScope, repo)

        feature.state.test {
            awaitItem() // initial
            feature.process(DevSettingsEvent.ScreenVisible)
            awaitItem() // loaded: both DEV

            feature.process(DevSettingsEvent.EnvironmentTapped(Environment.PROD))
            val selected = awaitItem()
            assertEquals(Environment.DEV, selected.activeEnvironment)
            assertEquals(Environment.PROD, selected.selectedEnvironment)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SwitchConfirmed saves environment and emits RestartApp effect`() = runTest {
        val repo = FakeDevSettingsRepository(stored = Environment.DEV)
        val feature = DevSettingsFeature(backgroundScope, repo)

        feature.effects.test {
            feature.process(DevSettingsEvent.ScreenVisible)
            feature.process(DevSettingsEvent.SwitchConfirmed(Environment.PROD))
            assertEquals(DevSettingsEffect.RestartApp, awaitItem())
            assertEquals(Environment.PROD, repo.getActiveEnvironment())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.devsettings.DevSettingsFeatureTest"
```

Expected: FAIL — `DevSettingsFeature`, `DevSettingsEvent`, `DevSettingsEffect` not found.

- [ ] **Step 3: Implement DevSettingsFeature**

Create `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsFeature.kt`:

```kotlin
package com.trilium.syncpods.devsettings

import com.composure.arch.Interactor
import com.composure.arch.StandardFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

// ── State ─────────────────────────────────────────────────────────────────────

data class DevSettingsState(
    val activeEnvironment: Environment = Environment.DEV,
    val selectedEnvironment: Environment = Environment.DEV,
)

// ── Events ────────────────────────────────────────────────────────────────────

sealed class DevSettingsEvent {
    data object ScreenVisible : DevSettingsEvent()
    data class EnvironmentTapped(val environment: Environment) : DevSettingsEvent()
    // Screen reads state.selectedEnvironment and passes it here — keeps eventToAction stateless
    data class SwitchConfirmed(val environment: Environment) : DevSettingsEvent()
}

// ── Actions ───────────────────────────────────────────────────────────────────

sealed class DevSettingsAction {
    data object LoadEnvironment : DevSettingsAction()
    data class SelectEnvironment(val environment: Environment) : DevSettingsAction()
    data class CommitAndRestart(val environment: Environment) : DevSettingsAction()
}

// ── Results ───────────────────────────────────────────────────────────────────

sealed class DevSettingsResult {
    data class EnvironmentLoaded(val environment: Environment) : DevSettingsResult()
    data class EnvironmentSelected(val environment: Environment) : DevSettingsResult()
}

// ── Effects ───────────────────────────────────────────────────────────────────

sealed class DevSettingsEffect {
    data object RestartApp : DevSettingsEffect()
}

// ── Feature ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class DevSettingsFeature(
    scope: CoroutineScope,
    private val repository: DevSettingsRepository,
) : StandardFeature<DevSettingsState, DevSettingsEvent, DevSettingsAction, DevSettingsResult, DevSettingsEffect>(scope) {

    private val _effects = MutableSharedFlow<DevSettingsEffect>(extraBufferCapacity = 8)
    override val effects: SharedFlow<DevSettingsEffect> get() = _effects

    override val initial = DevSettingsState()

    override val eventToAction: Interactor<DevSettingsEvent, DevSettingsAction> = { events ->
        merge(
            events.filterIsInstance<DevSettingsEvent.ScreenVisible>()
                .map { DevSettingsAction.LoadEnvironment },

            events.filterIsInstance<DevSettingsEvent.EnvironmentTapped>()
                .map { DevSettingsAction.SelectEnvironment(it.environment) },

            events.filterIsInstance<DevSettingsEvent.SwitchConfirmed>()
                .map { DevSettingsAction.CommitAndRestart(it.environment) },
        )
    }

    override val actionToResult: Interactor<DevSettingsAction, DevSettingsResult> = { actions ->
        actions.flatMapLatest { action ->
            when (action) {
                is DevSettingsAction.LoadEnvironment -> flow {
                    emit(DevSettingsResult.EnvironmentLoaded(repository.getActiveEnvironment()))
                }

                is DevSettingsAction.SelectEnvironment -> flow {
                    emit(DevSettingsResult.EnvironmentSelected(action.environment))
                }

                is DevSettingsAction.CommitAndRestart -> flow {
                    repository.saveEnvironment(action.environment)
                    _effects.emit(DevSettingsEffect.RestartApp)
                }
            }
        }
    }

    override suspend fun handleResult(
        previous: DevSettingsState,
        result: DevSettingsResult,
    ): DevSettingsState = when (result) {
        is DevSettingsResult.EnvironmentLoaded ->
            previous.copy(activeEnvironment = result.environment, selectedEnvironment = result.environment)
        is DevSettingsResult.EnvironmentSelected ->
            previous.copy(selectedEnvironment = result.environment)
    }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.devsettings.DevSettingsFeatureTest"
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsFeature.kt \
        mobile/composeApp/src/commonTest/kotlin/com/trilium/syncpods/devsettings/DevSettingsFeatureTest.kt
git commit -m "feat: add DevSettingsFeature UDF pipeline"
```

---

### Task 5: DevSettingsViewModel

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsViewModel.kt`

- [ ] **Step 1: Create the ViewModel**

```kotlin
package com.trilium.syncpods.devsettings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.plus

class DevSettingsViewModel(repo: DevSettingsRepository) : ViewModel() {
    val feature = DevSettingsFeature(viewModelScope + Dispatchers.Default, repo)
}
```

- [ ] **Step 2: Verify build**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsViewModel.kt
git commit -m "feat: add DevSettingsViewModel"
```

---

### Task 6: Add DevSettings route to AppRoutes

**Files:**
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/navigation/AppRoutes.kt`

- [ ] **Step 1: Add the route**

```kotlin
package com.trilium.syncpods.navigation

sealed class AppRoutes(val route: String) {
    data object Discover : AppRoutes("discover")
    data object Library : AppRoutes("library")
    data object Queue : AppRoutes("queue")
    data object History : AppRoutes("history")
    data object Profile : AppRoutes("profile")
    data class PodcastDetail(val feedUrl: String) : AppRoutes("podcast/{feedUrl}") {
        companion object {
            const val ROUTE = "podcast/{feedUrl}"
        }
    }
    data class Search(val query: String) : AppRoutes("search/{query}") {
        companion object {
            const val ROUTE = "search/{query}"
        }
    }
    data class PlaylistDetail(val id: String) : AppRoutes("playlist/{id}") {
        companion object {
            const val ROUTE = "playlist/{id}"
        }
    }
    data object Settings : AppRoutes("settings")
    data object DevSettings : AppRoutes("dev-settings")
    data object Login : AppRoutes("login")
    data object ForgotPassword : AppRoutes("forgot-password")
    data object SignUp : AppRoutes("signup")
    data class VerifyEmail(val email: String) : AppRoutes("verify-email/{email}") {
        companion object {
            const val ROUTE = "verify-email/{email}"
        }
    }
}
```

- [ ] **Step 2: Verify build**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/navigation/AppRoutes.kt
git commit -m "feat: add DevSettings route to AppRoutes"
```

---

### Task 7: Create DevSettingsScreen

**Files:**
- Create: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsScreen.kt`

- [ ] **Step 1: Create the screen**

```kotlin
package com.trilium.syncpods.devsettings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlin.system.exitProcess

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevSettingsScreen(
    feature: DevSettingsFeature,
    onBack: () -> Unit,
) {
    val state by feature.state.collectAsState()

    LaunchedEffect(Unit) {
        feature.process(DevSettingsEvent.ScreenVisible)
    }

    LaunchedEffect(Unit) {
        feature.effects.collect { effect ->
            when (effect) {
                DevSettingsEffect.RestartApp -> exitProcess(0)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Developer Settings")
                        Spacer(Modifier.width(8.dp))
                        Surface(
                            color = MaterialTheme.colorScheme.error,
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            Text(
                                text = "DEBUG",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onError,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "BACKEND ENVIRONMENT",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Environment.entries.forEach { env ->
                EnvironmentCard(
                    environment = env,
                    isActive = env == state.activeEnvironment,
                    isSelected = env == state.selectedEnvironment,
                    onClick = { feature.process(DevSettingsEvent.EnvironmentTapped(env)) },
                )
            }

            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(8.dp),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "Switching restarts the app",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        Text(
                            text = "Your current session will be lost.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }

            Button(
                onClick = { feature.process(DevSettingsEvent.SwitchConfirmed(state.selectedEnvironment)) },
                enabled = state.selectedEnvironment != state.activeEnvironment,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Switch to ${state.selectedEnvironment.displayName} & Restart")
            }
        }
    }
}

@Composable
private fun EnvironmentCard(
    environment: Environment,
    isActive: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val borderColor = when {
        isActive -> MaterialTheme.colorScheme.primary
        isSelected -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.outline
    }
    val borderWidth = if (isActive || isSelected) 2.dp else 1.dp

    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(borderWidth, borderColor),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = environment.displayName,
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    text = environment.host,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (isActive) {
                Surface(
                    color = MaterialTheme.colorScheme.primary,
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text(
                        text = "ACTIVE",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}
```

- [ ] **Step 2: Verify build**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/devsettings/DevSettingsScreen.kt
git commit -m "feat: add DevSettingsScreen composable"
```

---

### Task 8: Wire AppShell and AppModule

**Files:**
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt`
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`

- [ ] **Step 1: Register DevSettingsViewModel and DevSettingsRepository in AppModule**

In `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`, add these imports:

```kotlin
import com.trilium.syncpods.devsettings.DevSettingsRepository
import com.trilium.syncpods.devsettings.DevSettingsRepositoryImpl
import com.trilium.syncpods.devsettings.DevSettingsViewModel
import com.trilium.syncpods.isDebug
```

Then add at the bottom of the `appModule` block (before the closing `}`), gated by `isDebug`:

```kotlin
    if (isDebug) {
        single<DevSettingsRepository> { DevSettingsRepositoryImpl(settings = get()) }
        viewModel { DevSettingsViewModel(get()) }
    }
```

- [ ] **Step 2: Register DevSettings nav destination in AppShell**

In `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt`, add these imports:

```kotlin
import com.trilium.syncpods.devsettings.DevSettingsScreen
import com.trilium.syncpods.devsettings.DevSettingsViewModel
import com.trilium.syncpods.isDebug
```

In the `isFullScreenRoute` expression, add `|| currentDestination?.route == AppRoutes.DevSettings.route` at the end.

Inside the `NavHost { }` block, add after the existing `composable(AppRoutes.Settings.route) { ... }` block:

```kotlin
            if (isDebug) {
                composable(AppRoutes.DevSettings.route) {
                    val viewModel = koinViewModel<DevSettingsViewModel>()
                    DevSettingsScreen(
                        feature = viewModel.feature,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
```

Also update the `composable(AppRoutes.Settings.route) { ... }` block to pass `onNavigateToDevSettings`:

```kotlin
            composable(AppRoutes.Settings.route) {
                val settingsViewModel = koinViewModel<SettingsViewModel>()
                SettingsScreen(
                    feature = settingsViewModel.feature,
                    onBack = { navController.popBackStack() },
                    onSignedOut = {
                        navController.popBackStack()
                        navController.navigate(AppRoutes.Profile.route) {
                            launchSingleTop = true
                            restoreState = false
                        }
                    },
                    onNavigateToDevSettings = {
                        navController.navigate(AppRoutes.DevSettings.route)
                    },
                )
            }
```

- [ ] **Step 3: Verify build**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: FAIL — `SettingsScreen` doesn't yet accept `onNavigateToDevSettings`. That's expected; Task 9 fixes it.

- [ ] **Step 4: Commit the AppShell and AppModule changes**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt \
        mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt
git commit -m "feat: register DevSettings in AppModule and AppShell nav"
```

---

### Task 9: Add long-press to SettingsScreen

**Files:**
- Modify: `mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsScreen.kt`

- [ ] **Step 1: Update SettingsScreen signature and version item**

Add `onNavigateToDevSettings: () -> Unit = {}` parameter. Add the `combinedClickable` import and `isDebug` import. Replace the version `item { }` block at the bottom of the `LazyColumn`.

The full updated file:

```kotlin
package com.trilium.syncpods.settings

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.trilium.syncpods.isDebug
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun SettingsScreen(
    feature: SettingsFeature,
    onBack: () -> Unit,
    onSignedOut: () -> Unit = {},
    onNavigateToDevSettings: () -> Unit = {},
) {
    val state by feature.state.collectAsState()
    LaunchedEffect(Unit) {
        feature.process(SettingsEvent.ScreenVisible)
    }

    LaunchedEffect(Unit) {
        feature.effects.collect { effect ->
            when (effect) {
                is SettingsEffect.NavigateToProfile -> onSignedOut()
            }
        }
    }

    var showLoadingIndicator by remember { mutableStateOf(false) }
    LaunchedEffect(state.isSigningOut) {
        if (state.isSigningOut) {
            delay(2_000)
            showLoadingIndicator = true
        } else {
            showLoadingIndicator = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            item {
                SettingsSectionHeader("PREFERENCES")
            }
            item {
                SettingsRow(
                    icon = Icons.Default.Notifications,
                    label = "Notification Settings",
                    onClick = { feature.process(SettingsEvent.NotificationsTapped) },
                )
            }
            item {
                SettingsRow(
                    icon = Icons.Default.Tune,
                    label = "Playback Defaults",
                    onClick = { feature.process(SettingsEvent.PlaybackDefaultsTapped) },
                )
            }
            item { HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp)) }
            item {
                SettingsSectionHeader("DATA & ACCOUNT")
            }
            item {
                SettingsRow(
                    icon = Icons.Default.SwapVert,
                    label = "OPML Import/Export",
                    trailingIcon = Icons.Default.Lock,
                    onClick = { feature.process(SettingsEvent.OPMLTapped) },
                )
            }
            item {
                SettingsRow(
                    icon = Icons.Default.CreditCard,
                    label = "Manage Subscription",
                    onClick = { feature.process(SettingsEvent.ManageSubscriptionTapped) },
                )
            }
            if (state.isSignedIn) {
                item {
                    SignOutRow(
                        showLoadingIndicator = showLoadingIndicator,
                        isSigningOut = state.isSigningOut,
                        onClick = { feature.process(SettingsEvent.SignOutTapped) },
                    )
                }
            }
            if (state.error != null) {
                item {
                    Text(
                        text = state.error!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
            }
            item {
                Spacer(Modifier.height(32.dp))
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = if (isDebug) {
                                Modifier.combinedClickable(
                                    onClick = {},
                                    onLongClick = onNavigateToDevSettings,
                                )
                            } else {
                                Modifier
                            },
                        ) {
                            Text(
                                text = "SyncPods v1.0.0 (Build 1)",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (isDebug) {
                            Text(
                                text = "long-press to open dev tools",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun SettingsSectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun SettingsRow(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    trailingIcon: ImageVector? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.width(16.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        if (trailingIcon != null) {
            Icon(
                imageVector = trailingIcon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun SignOutRow(
    showLoadingIndicator: Boolean,
    isSigningOut: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !isSigningOut, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showLoadingIndicator) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.error,
            )
        } else {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(22.dp),
            )
        }
        Spacer(Modifier.width(16.dp))
        Text(
            text = "Sign Out",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
    }
}
```

- [ ] **Step 2: Verify build**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Run all tests**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsScreen.kt
git commit -m "feat: add long-press dev tools entry point to SettingsScreen"
```

---

### Task 10: Android startup wiring

Wire `SelectedEnvironment` so that credential selection happens before Koin builds its graph.

**Files:**
- Modify: `mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/Platform.android.kt`
- Modify: `mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/di/PlatformModule.android.kt`
- Modify: `mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/SupabaseClient.android.kt`
- Modify: `mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt`

- [ ] **Step 1: Add SelectedEnvironment object to Platform.android.kt**

```kotlin
package com.trilium.syncpods

import android.os.Build

class AndroidPlatform : Platform {
    override val name: String = "Android ${Build.VERSION.SDK_INT}"
}

actual fun getPlatform(): Platform = AndroidPlatform()

actual val isDebug: Boolean get() = BuildConfig.DEBUG

object SelectedEnvironment {
    var url: String = BuildConfig.SUPABASE_URL
    var key: String = BuildConfig.SUPABASE_ANON_KEY
}
```

- [ ] **Step 2: Update PlatformModule.android.kt to delegate to SelectedEnvironment**

```kotlin
package com.trilium.syncpods.di

import com.trilium.syncpods.BuildConfig
import com.trilium.syncpods.SelectedEnvironment
import com.trilium.syncpods.billing.AndroidBillingHandler
import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.player.AndroidAudioPlayer
import com.trilium.syncpods.player.AudioPlayer
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.Module
import org.koin.dsl.module

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Android)

actual val supabaseUrl: String get() = SelectedEnvironment.url
actual val supabaseAnonKey: String get() = SelectedEnvironment.key

actual fun audioPlayerModule(): Module = module {
    single<AudioPlayer> { AndroidAudioPlayer(androidContext()) }
}

actual fun billingHandlerModule(): Module = module {
    single<BillingHandler> { AndroidBillingHandler(androidContext()) }
}
```

- [ ] **Step 3: Update SupabaseClient.android.kt to use SelectedEnvironment**

```kotlin
package com.trilium.syncpods

import com.trilium.syncpods.SelectedEnvironment
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.compose.auth.ComposeAuth
import io.github.jan.supabase.compose.auth.googleNativeLogin

actual fun createSupabaseClient(): SupabaseClient = createSupabaseClient(
    supabaseUrl = SelectedEnvironment.url,
    supabaseKey = SelectedEnvironment.key,
) {
    install(Postgrest)
    install(Auth) {
        scheme = "syncpods"
        host = "auth"
    }
    install(Realtime)
    install(ComposeAuth) {
        googleNativeLogin(serverClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID)
    }
}.installJwtRefreshInterceptor()
```

- [ ] **Step 4: Update MainActivity to init SelectedEnvironment before startKoin**

```kotlin
package com.trilium.syncpods

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.trilium.syncpods.billing.AndroidBillingHandler
import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.di.appModule
import com.trilium.syncpods.deeplink.PendingDeepLink
import com.trilium.syncpods.deeplink.parsePlaylistDeepLink
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.handleDeeplinks
import org.koin.android.ext.android.inject
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.GlobalContext
import org.koin.core.context.startKoin

class MainActivity : ComponentActivity() {

    private val supabaseClient: SupabaseClient by inject()
    private val pendingDeepLink: PendingDeepLink by inject()
    private val billingHandler: BillingHandler by inject()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        if (GlobalContext.getOrNull() == null) {
            if (BuildConfig.DEBUG) {
                val prefs = getSharedPreferences("dev_settings", Context.MODE_PRIVATE)
                val env = prefs.getString("dev_settings_env", "dev")
                SelectedEnvironment.url = if (env == "prod") BuildConfig.PROD_SUPABASE_URL else BuildConfig.DEV_SUPABASE_URL
                SelectedEnvironment.key = if (env == "prod") BuildConfig.PROD_SUPABASE_ANON_KEY else BuildConfig.DEV_SUPABASE_ANON_KEY
            }
            startKoin {
                androidContext(this@MainActivity)
                modules(appModule)
            }
        }

        handleAuthIntent(intent)
        handlePlaylistIntent(intent)

        setContent {
            App()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleAuthIntent(intent)
        handlePlaylistIntent(intent)
    }

    private fun handleAuthIntent(intent: Intent) {
        supabaseClient.handleDeeplinks(intent)
    }

    private fun handlePlaylistIntent(intent: Intent) {
        val url = intent.data?.toString() ?: return
        val route = parsePlaylistDeepLink(url) ?: return
        pendingDeepLink.set(route)
    }

    override fun onResume() {
        super.onResume()
        (billingHandler as? AndroidBillingHandler)?.onActivityResumed(this)
    }

    override fun onPause() {
        super.onPause()
        (billingHandler as? AndroidBillingHandler)?.onActivityPaused()
    }
}

@Preview
@Composable
fun AppAndroidPreview() {
    App()
}
```

- [ ] **Step 5: Build and verify**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Run all tests**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/Platform.android.kt \
        mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/di/PlatformModule.android.kt \
        mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/SupabaseClient.android.kt \
        mobile/composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt
git commit -m "feat: Android startup environment selection via SelectedEnvironment"
```

---

### Task 11: iOS startup wiring

**Files:**
- Modify: `mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/PlatformModule.ios.kt`
- Modify: `mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/SupabaseClient.ios.kt`
- Modify: `mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/MainViewController.kt`
- Modify: `mobile/iosApp/iosApp/Info.plist`

- [ ] **Step 1: Add SelectedEnvironment and init function to PlatformModule.ios.kt**

```kotlin
package com.trilium.syncpods.di

import com.trilium.syncpods.billing.BillingHandler
import com.trilium.syncpods.billing.IOSBillingHandler
import com.trilium.syncpods.player.AudioPlayer
import com.trilium.syncpods.player.IOSAudioPlayer
import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import org.koin.core.module.Module
import org.koin.dsl.module
import platform.Foundation.NSBundle
import platform.Foundation.NSUserDefaults
import kotlin.native.Platform as KNPlatform

object SelectedEnvironment {
    var url: String = ""
    var key: String = ""
}

fun initSelectedEnvironment() {
    val bundle = NSBundle.mainBundle
    val devUrl = bundle.objectForInfoDictionaryKey("SUPABASE_URL") as? String ?: ""
    val devKey = bundle.objectForInfoDictionaryKey("SUPABASE_ANON_KEY") as? String ?: ""
    val prodUrl = bundle.objectForInfoDictionaryKey("PROD_SUPABASE_URL") as? String ?: ""
    val prodKey = bundle.objectForInfoDictionaryKey("PROD_SUPABASE_ANON_KEY") as? String ?: ""

    val userDefaults = NSUserDefaults.standardUserDefaults
    val env = userDefaults.stringForKey("dev_settings_env") ?: "dev"
    val useProd = KNPlatform.isDebugBinary && env == "prod"

    SelectedEnvironment.url = if (useProd) prodUrl else devUrl
    SelectedEnvironment.key = if (useProd) prodKey else devKey
}

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Darwin)

actual val supabaseUrl: String get() = SelectedEnvironment.url
actual val supabaseAnonKey: String get() = SelectedEnvironment.key

actual fun audioPlayerModule(): Module = module {
    single<AudioPlayer> { IOSAudioPlayer() }
}

actual fun billingHandlerModule(): Module = module {
    single<BillingHandler> { IOSBillingHandler() }
}
```

- [ ] **Step 2: Update SupabaseClient.ios.kt to use SelectedEnvironment**

```kotlin
package com.trilium.syncpods

import com.trilium.syncpods.di.SelectedEnvironment
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.compose.auth.ComposeAuth
import io.github.jan.supabase.compose.auth.googleNativeLogin
import platform.Foundation.NSBundle

actual fun createSupabaseClient(): SupabaseClient = createSupabaseClient(
    supabaseUrl = SelectedEnvironment.url,
    supabaseKey = SelectedEnvironment.key,
) {
    install(Postgrest)
    install(Auth) {
        scheme = "syncpods"
        host = "auth"
    }
    install(Realtime)
    install(ComposeAuth) {
        googleNativeLogin(
            serverClientId = NSBundle.mainBundle.objectForInfoDictionaryKey("GOOGLE_WEB_CLIENT_ID") as? String ?: ""
        )
    }
}.installJwtRefreshInterceptor()
```

- [ ] **Step 3: Update MainViewController.kt to call initSelectedEnvironment before startKoin**

```kotlin
package com.trilium.syncpods

import androidx.compose.ui.window.ComposeUIViewController
import com.trilium.syncpods.di.appModule
import com.trilium.syncpods.di.initSelectedEnvironment
import io.github.jan.supabase.SupabaseClient
import org.koin.core.context.startKoin

private var koinStarted = false

fun MainViewController() = run {
    if (!koinStarted) {
        initSelectedEnvironment()
        val koin = startKoin { modules(appModule) }.koin
        initAuthDeepLinkHandler(koin.get<SupabaseClient>())
        koinStarted = true
    }
    ComposeUIViewController { App() }
}
```

- [ ] **Step 4: Add PROD_SUPABASE_URL and PROD_SUPABASE_ANON_KEY to Info.plist**

In `mobile/iosApp/iosApp/Info.plist`, add two new entries after the existing `SUPABASE_ANON_KEY` entry:

```xml
	<key>PROD_SUPABASE_URL</key>
	<string>https://dqqybduklxwxtcahqswh.supabase.co</string>
	<key>PROD_SUPABASE_ANON_KEY</key>
	<string>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcXliZHVrbHh3eHRjYWhxc3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzg1NTUsImV4cCI6MjA4OTgxNDU1NX0.FjWqyS1H5Ywsq8CpgI_8_8Ve7HoBo5jOTNmsbxxNZGs</string>
```

The resulting `Info.plist` `<dict>` block should look like:

```xml
<dict>
	<key>CADisableMinimumFrameDurationOnPhone</key>
	<true/>
	<key>SUPABASE_URL</key>
	<string>https://nuvadoybccdqipyhdhns.supabase.co</string>
	<key>SUPABASE_ANON_KEY</key>
	<string>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmFkb3liY2NkcWlweWhkaG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MjE2MzEsImV4cCI6MjA4ODQ5NzYzMX0.ESzA7Zf2UNrAKleTjlscx94KOZHtJ4PWfsaR4FdSQjk</string>
	<key>PROD_SUPABASE_URL</key>
	<string>https://dqqybduklxwxtcahqswh.supabase.co</string>
	<key>PROD_SUPABASE_ANON_KEY</key>
	<string>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcXliZHVrbHh3eHRjYWhxc3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzg1NTUsImV4cCI6MjA4OTgxNDU1NX0.FjWqyS1H5Ywsq8CpgI_8_8Ve7HoBo5jOTNmsbxxNZGs</string>
	<key>GOOGLE_WEB_CLIENT_ID</key>
	<string>$(GOOGLE_WEB_CLIENT_ID)</string>
	<key>GOOGLE_IOS_CLIENT_ID</key>
	<string>$(GOOGLE_IOS_CLIENT_ID)</string>
	<key>GIDClientID</key>
	<string>$(GIDClientID)</string>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>$(GOOGLE_IOS_REVERSE_CLIENT_ID)</string>
			</array>
		</dict>
		<dict>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>CFBundleURLName</key>
			<string>com.trilium.syncpods.auth</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>syncpods</string>
			</array>
		</dict>
	</array>
</dict>
```

- [ ] **Step 5: Build and verify (Android)**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Run all tests**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/di/PlatformModule.ios.kt \
        mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/SupabaseClient.ios.kt \
        mobile/composeApp/src/iosMain/kotlin/com/trilium/syncpods/MainViewController.kt \
        mobile/iosApp/iosApp/Info.plist
git commit -m "feat: iOS startup environment selection via SelectedEnvironment"
```
