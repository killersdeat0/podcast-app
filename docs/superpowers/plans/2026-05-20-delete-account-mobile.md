# Delete Account (Mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Delete Account" row to the mobile Settings screen that shows a native confirmation dialog then opens `syncpods.app/settings` in the system browser.

**Architecture:** `DeleteAccountTapped` event flows through the existing UDF pipeline in `SettingsFeature` and emits an `OpenDeleteAccountPage` effect. `SettingsScreen` captures the effect and opens the URL via Compose's `LocalUriHandler`. Dialog state is local UI state — not lifted into the feature.

**Tech Stack:** Kotlin Multiplatform, Compose Multiplatform, `app.cash.turbine`, `kotlinx-coroutines-test`, `kotlin.test`

---

## Files

| Action | Path |
|--------|------|
| Modify | `composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsFeature.kt` |
| Modify | `composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsScreen.kt` |
| Create | `composeApp/src/commonTest/kotlin/com/trilium/syncpods/settings/SettingsFeatureTest.kt` |

---

### Task 1: Extend SettingsFeature with DeleteAccount event, action, and effect

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsFeature.kt`

- [ ] **Step 1: Add `DeleteAccountTapped` to `SettingsEvent`**

In `SettingsFeature.kt`, update the `SettingsEvent` sealed class:

```kotlin
sealed class SettingsEvent {
    data object ScreenVisible : SettingsEvent()
    data object SignOutTapped : SettingsEvent()
    data object DeleteAccountTapped : SettingsEvent()
    data object NotificationsTapped : SettingsEvent()
    data object PlaybackDefaultsTapped : SettingsEvent()
    data object OPMLTapped : SettingsEvent()
    data object ManageSubscriptionTapped : SettingsEvent()
}
```

- [ ] **Step 2: Add `NavigateToDeleteAccount` to `SettingsAction`**

```kotlin
sealed class SettingsAction {
    data object LoadAuthState : SettingsAction()
    data object SignOut : SettingsAction()
    data object NavigateToDeleteAccount : SettingsAction()
    data object NavigateToNotifications : SettingsAction()
    data object NavigateToPlaybackDefaults : SettingsAction()
    data object NavigateToOPML : SettingsAction()
    data object NavigateToManageSubscription : SettingsAction()
}
```

- [ ] **Step 3: Add `OpenDeleteAccountPage` to `SettingsEffect`**

```kotlin
sealed class SettingsEffect {
    data object NavigateToProfile : SettingsEffect()
    data object OpenDeleteAccountPage : SettingsEffect()
}
```

- [ ] **Step 4: Wire event → action in `eventToAction`**

Add this branch to the `merge(...)` call inside `eventToAction`:

```kotlin
events.filterIsInstance<SettingsEvent.DeleteAccountTapped>()
    .map { SettingsAction.NavigateToDeleteAccount },
```

- [ ] **Step 5: Wire action → effect in `actionToResult`**

Add this branch to the `when (action)` inside `actionToResult`:

```kotlin
is SettingsAction.NavigateToDeleteAccount -> flow {
    _effects.emit(SettingsEffect.OpenDeleteAccountPage)
}
```

- [ ] **Step 6: Build to verify no compile errors**

```bash
./gradlew :composeApp:compileKotlinAndroid
```

Expected: `BUILD SUCCESSFUL`

---

### Task 2: Write and pass SettingsFeature tests

**Files:**
- Create: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/settings/SettingsFeatureTest.kt`

- [ ] **Step 1: Create `FakeSettingsRepository`**

The test file needs a fake that satisfies `SettingsRepository`. Create the file with:

```kotlin
package com.trilium.syncpods.settings

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertIs

private class FakeSettingsRepository(
    private val signedIn: Boolean = true,
) : SettingsRepository {
    override fun isSignedIn(): Boolean = signedIn
    override suspend fun signOut() {}
}
```

- [ ] **Step 2: Write failing test — `DeleteAccountTapped` emits `OpenDeleteAccountPage` effect**

Append to the same file:

```kotlin
class SettingsFeatureTest {

    @Test
    fun `DeleteAccountTapped emits OpenDeleteAccountPage effect`() = runTest {
        val feature = SettingsFeature(backgroundScope, FakeSettingsRepository())

        feature.effects.test {
            feature.process(SettingsEvent.DeleteAccountTapped)
            assertIs<SettingsEffect.OpenDeleteAccountPage>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

- [ ] **Step 3: Run test to verify it fails (before implementation is wired)**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.settings.SettingsFeatureTest" 2>&1 | tail -20
```

Expected: test is not found or fails (depends on compile state — if Task 1 is done, it will pass; run this step before Task 1 Step 4-5 if doing strict TDD, or confirm green after Task 1).

- [ ] **Step 4: Run tests to confirm green**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.settings.SettingsFeatureTest" 2>&1 | tail -20
```

Expected:

```
> Task :composeApp:testDebugUnitTest
BUILD SUCCESSFUL
```

- [ ] **Step 5: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsFeature.kt \
        composeApp/src/commonTest/kotlin/com/trilium/syncpods/settings/SettingsFeatureTest.kt
git commit -m "feat: add DeleteAccountTapped event and OpenDeleteAccountPage effect to SettingsFeature"
```

---

### Task 3: Update SettingsScreen with Delete Account row and confirmation dialog

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsScreen.kt`

- [ ] **Step 1: Add `LocalUriHandler` import**

Add to the import block at the top of `SettingsScreen.kt`:

```kotlin
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
```

- [ ] **Step 2: Capture `uriHandler` and add dialog state in `SettingsScreen`**

Inside the `SettingsScreen` composable, after the existing `val state by feature.state.collectAsState()` line, add:

```kotlin
val uriHandler = LocalUriHandler.current
var showDeleteConfirmDialog by remember { mutableStateOf(false) }
```

- [ ] **Step 3: Extend the existing effects `LaunchedEffect` to handle `OpenDeleteAccountPage`**

The current block is:

```kotlin
LaunchedEffect(Unit) {
    feature.effects.collect { effect ->
        when (effect) {
            is SettingsEffect.NavigateToProfile -> onSignedOut()
        }
    }
}
```

Replace with:

```kotlin
LaunchedEffect(Unit) {
    feature.effects.collect { effect ->
        when (effect) {
            is SettingsEffect.NavigateToProfile -> onSignedOut()
            is SettingsEffect.OpenDeleteAccountPage ->
                uriHandler.openUri("https://syncpods.app/settings")
        }
    }
}
```

- [ ] **Step 4: Add `DeleteAccountRow` after the Sign Out row**

The current Sign Out block ends at:

```kotlin
if (state.isSignedIn) {
    item {
        SignOutRow(
            showLoadingIndicator = showLoadingIndicator,
            isSigningOut = state.isSigningOut,
            onClick = { feature.process(SettingsEvent.SignOutTapped) },
        )
    }
}
```

Replace with:

```kotlin
if (state.isSignedIn) {
    item {
        SignOutRow(
            showLoadingIndicator = showLoadingIndicator,
            isSigningOut = state.isSigningOut,
            onClick = { feature.process(SettingsEvent.SignOutTapped) },
        )
    }
    item {
        DeleteAccountRow(onClick = { showDeleteConfirmDialog = true })
    }
}
```

- [ ] **Step 5: Add `DeleteAccountRow` composable**

Add this private composable at the bottom of the file, alongside the other private composables:

```kotlin
@Composable
private fun DeleteAccountRow(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.Delete,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.width(16.dp))
        Text(
            text = "Delete Account",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
    }
}
```

- [ ] **Step 6: Add the confirmation `AlertDialog`**

Add this block inside `SettingsScreen`, just before the closing brace of the `Scaffold` (after the `LazyColumn`):

```kotlin
if (showDeleteConfirmDialog) {
    AlertDialog(
        onDismissRequest = { showDeleteConfirmDialog = false },
        title = { Text("Delete Account") },
        text = {
            Text("This will permanently delete your account and all your data. You'll be taken to the website to complete the process.")
        },
        confirmButton = {
            TextButton(
                onClick = {
                    showDeleteConfirmDialog = false
                    feature.process(SettingsEvent.DeleteAccountTapped)
                },
            ) {
                Text("Continue", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = { showDeleteConfirmDialog = false }) {
                Text("Cancel")
            }
        },
    )
}
```

- [ ] **Step 7: Build to verify no compile errors**

```bash
./gradlew :composeApp:compileKotlinAndroid
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 8: Run all Settings tests**

```bash
./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.settings.*" 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 9: Commit**

```bash
git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/settings/SettingsScreen.kt
git commit -m "feat: add Delete Account row and confirmation dialog to SettingsScreen"
```
