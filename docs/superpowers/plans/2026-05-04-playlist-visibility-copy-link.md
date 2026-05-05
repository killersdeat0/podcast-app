# Playlist Visibility Toggle + Copy Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Public/Private chip in PlaylistDetailScreen functional, add a Copy Link chip (visible when public only), and wire up `https://syncpods.app/playlist/{id}` as a Universal Link / App Link that deep-links into the playlist page.

**Architecture:** A pure `parsePlaylistDeepLink` function parses incoming URLs to nav routes. A Koin singleton `PendingDeepLink` (a `StateFlow<String?>`) carries a pending nav route from platform entry points (Android `MainActivity`, iOS `.onOpenURL`) to `AppShell`, which navigates and clears it. The UI uses Compose Multiplatform's `LocalClipboardManager` (no `expect/actual` needed) for clipboard access.

**Tech Stack:** Kotlin Multiplatform, Compose Multiplatform, Koin, Jetpack Navigation Compose, Supabase, Next.js (web).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParser.kt` | **Create** | Pure URL→route parser |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PendingDeepLink.kt` | **Create** | Koin singleton: `StateFlow<String?>` for pending nav route |
| `composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParserTest.kt` | **Create** | Tests for parser |
| `composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PendingDeepLinkTest.kt` | **Create** | Tests for PendingDeepLink |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt` | **Modify** | Register `PendingDeepLink` singleton |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailScreen.kt` | **Modify** | Chip callbacks, Copy Link chip, snackbar, remove top-bar lock icon |
| `composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt` | **Modify** | Collect `PendingDeepLink.route`, navigate, consume |
| `composeApp/src/androidMain/AndroidManifest.xml` | **Modify** | App Links intent filter for `/playlist/*` |
| `composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt` | **Modify** | Parse playlist intent, set `PendingDeepLink` |
| `composeApp/src/iosMain/kotlin/com/trilium/syncpods/AuthDeepLinkHandler.kt` | **Modify** | Add unified `handleDeepLink` function |
| `iosApp/iosApp/iOSApp.swift` | **Modify** | Call `handleDeepLink` instead of `handleAuthDeepLink` |
| `iosApp/iosApp/iosApp.entitlements` | **Create** | Associated Domains entitlement |
| `web/public/.well-known/assetlinks.json` | **Create** | Android App Links verification |
| `web/public/.well-known/apple-app-site-association` | **Create** | iOS Universal Links verification |
| `web/next.config.ts` | **Modify** | `Content-Type: application/json` header for AASA |

---

## Task 1: `parsePlaylistDeepLink` — pure URL parser

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParser.kt`
- Create: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParserTest.kt`

- [ ] **Step 1: Write the failing tests**

```kotlin
// composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParserTest.kt
package com.trilium.syncpods.deeplink

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PlaylistDeepLinkParserTest {

    @Test
    fun `returns nav route for valid playlist url`() {
        assertEquals("playlist/abc-123", parsePlaylistDeepLink("https://syncpods.app/playlist/abc-123"))
    }

    @Test
    fun `returns nav route and strips trailing slash`() {
        assertEquals("playlist/abc-123", parsePlaylistDeepLink("https://syncpods.app/playlist/abc-123/"))
    }

    @Test
    fun `returns null for non-playlist https url`() {
        assertNull(parsePlaylistDeepLink("https://syncpods.app/discover"))
    }

    @Test
    fun `returns null for playlist url with empty id`() {
        assertNull(parsePlaylistDeepLink("https://syncpods.app/playlist/"))
    }

    @Test
    fun `returns null for syncpods auth scheme`() {
        assertNull(parsePlaylistDeepLink("syncpods://auth"))
    }

    @Test
    fun `returns null for blank string`() {
        assertNull(parsePlaylistDeepLink(""))
    }
}
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.deeplink.PlaylistDeepLinkParserTest"
```

Expected: compilation error — `parsePlaylistDeepLink` does not exist.

- [ ] **Step 3: Implement the parser**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParser.kt
package com.trilium.syncpods.deeplink

private const val PLAYLIST_URL_PREFIX = "https://syncpods.app/playlist/"

fun parsePlaylistDeepLink(url: String): String? {
    if (!url.startsWith(PLAYLIST_URL_PREFIX)) return null
    val id = url.removePrefix(PLAYLIST_URL_PREFIX).trimEnd('/')
    return if (id.isNotBlank()) "playlist/$id" else null
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.deeplink.PlaylistDeepLinkParserTest"
```

Expected: `BUILD SUCCESSFUL`, 6 tests passed.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParser.kt \
  composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PlaylistDeepLinkParserTest.kt
git commit -m "feat: add parsePlaylistDeepLink URL parser"
```

---

## Task 2: `PendingDeepLink` singleton + Koin registration

**Files:**
- Create: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PendingDeepLink.kt`
- Create: `composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PendingDeepLinkTest.kt`
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`

- [ ] **Step 1: Write the failing tests**

```kotlin
// composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PendingDeepLinkTest.kt
package com.trilium.syncpods.deeplink

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PendingDeepLinkTest {

    @Test
    fun `initial route is null`() = runTest {
        val pending = PendingDeepLink()
        assertNull(pending.route.value)
    }

    @Test
    fun `set emits route`() = runTest {
        val pending = PendingDeepLink()
        pending.route.test {
            assertNull(awaitItem())
            pending.set("playlist/abc-123")
            assertEquals("playlist/abc-123", awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `consume clears route to null`() = runTest {
        val pending = PendingDeepLink()
        pending.set("playlist/abc-123")
        assertEquals("playlist/abc-123", pending.route.value)
        pending.consume()
        assertNull(pending.route.value)
    }

    @Test
    fun `set overwrites a previous route`() = runTest {
        val pending = PendingDeepLink()
        pending.set("playlist/first")
        pending.set("playlist/second")
        assertEquals("playlist/second", pending.route.value)
    }
}
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.deeplink.PendingDeepLinkTest"
```

Expected: compilation error — `PendingDeepLink` does not exist.

- [ ] **Step 3: Implement `PendingDeepLink`**

```kotlin
// composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PendingDeepLink.kt
package com.trilium.syncpods.deeplink

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PendingDeepLink {
    private val _route = MutableStateFlow<String?>(null)
    val route: StateFlow<String?> = _route.asStateFlow()
    fun set(route: String) { _route.value = route }
    fun consume() { _route.value = null }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd mobile && ./gradlew :composeApp:testDebugUnitTest --tests "com.trilium.syncpods.deeplink.PendingDeepLinkTest"
```

Expected: `BUILD SUCCESSFUL`, 4 tests passed.

- [ ] **Step 5: Register in Koin**

In `composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt`, add the import and registration:

Add import at the top of the file:
```kotlin
import com.trilium.syncpods.deeplink.PendingDeepLink
```

Add inside the `module { ... }` block, after the `single { PodcastSummaryCache() }` line:
```kotlin
single { PendingDeepLink() }
```

- [ ] **Step 6: Verify build**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

```bash
cd mobile && git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/deeplink/PendingDeepLink.kt \
  composeApp/src/commonTest/kotlin/com/trilium/syncpods/deeplink/PendingDeepLinkTest.kt \
  composeApp/src/commonMain/kotlin/com/trilium/syncpods/di/AppModule.kt
git commit -m "feat: add PendingDeepLink singleton for deep link nav routing"
```

---

## Task 3: PlaylistDetailScreen UI changes

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailScreen.kt`

Changes: (1) remove top-bar lock icon, (2) add `onTogglePublic`/`onCopyLink` params to `PlaylistHeader`, (3) add Copy Link chip, (4) wire callbacks from screen with snackbar + clipboard.

- [ ] **Step 1: Remove the top-bar lock icon from `PlaylistDetailScreen`**

In `PlaylistDetailScreen.kt`, find the `actions = { ... }` block inside `TopAppBar`. Remove the first `IconButton` (the lock/unlock icon). The lock-related imports will also need cleaning up after all changes. The remaining actions block should be:

```kotlin
actions = {
    TextButton(onClick = { feature.process(PlaylistDetailEvent.RenameTapped) }) {
        Text("Rename")
    }
    IconButton(onClick = { feature.process(PlaylistDetailEvent.DeletePlaylistTapped) }) {
        Icon(
            imageVector = Icons.Default.Delete,
            contentDescription = "Delete playlist",
            tint = MaterialTheme.colorScheme.error,
        )
    }
},
```

- [ ] **Step 2: Add callbacks to `PlaylistHeader` signature**

Find the `PlaylistHeader` composable (around line 219). Replace its signature:

```kotlin
@Composable
private fun PlaylistHeader(
    artworkUrls: List<String>,
    name: String,
    episodeCount: Int,
    isPublic: Boolean,
    onTogglePublic: () -> Unit,
    onCopyLink: (() -> Unit)?,
) {
```

- [ ] **Step 3: Replace the chip with a Row containing two chips in `PlaylistHeader`**

Find the existing `AssistChip` block inside `PlaylistHeader` (the one with `onClick = {}`). Replace it with:

```kotlin
Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    AssistChip(
        onClick = onTogglePublic,
        label = { Text(if (isPublic) "Public" else "Private") },
        leadingIcon = {
            Icon(
                imageVector = if (isPublic) Icons.Default.LockOpen else Icons.Default.Lock,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
            )
        },
    )
    if (onCopyLink != null) {
        AssistChip(
            onClick = onCopyLink,
            label = { Text("Copy Link") },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Link,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
            },
        )
    }
}
```

- [ ] **Step 4: Add imports for new UI elements**

Add these imports to `PlaylistDetailScreen.kt` (alongside existing imports):

```kotlin
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
```

- [ ] **Step 5: Wire snackbar + clipboard + callbacks in `PlaylistDetailScreen`**

In `PlaylistDetailScreen`, after `val coroutineScope = rememberCoroutineScope()`, add:

```kotlin
val snackbarHostState = remember { SnackbarHostState() }
val clipboardManager = LocalClipboardManager.current
val playlist = state.playlist
val onTogglePublic = { feature.process(PlaylistDetailEvent.PublicPrivateToggled(!(playlist?.isPublic ?: false))) }
val onCopyLink: (() -> Unit)? = playlist?.takeIf { it.isPublic }?.let { p ->
    {
        clipboardManager.setText(AnnotatedString("https://syncpods.app/playlist/${p.id}"))
        coroutineScope.launch { snackbarHostState.showSnackbar("Link copied") }
    }
}
```

Add `snackbarHost` to the `Scaffold`:

```kotlin
Scaffold(
    modifier = modifier,
    snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    topBar = { ... }
```

- [ ] **Step 6: Pass callbacks to `PlaylistHeader` (empty-state path)**

In the empty-state `Column`, find the `PlaylistHeader` call and add the new params:

```kotlin
PlaylistHeader(
    artworkUrls = playlist.artworkUrls,
    name = playlist.name,
    episodeCount = playlist.episodeCount,
    isPublic = playlist.isPublic,
    onTogglePublic = onTogglePublic,
    onCopyLink = onCopyLink,
)
```

- [ ] **Step 7: Add callbacks to `EpisodeList` and pass them through**

Update `EpisodeList` signature to accept the callbacks:

```kotlin
@Composable
private fun EpisodeList(
    state: PlaylistDetailState,
    feature: Feature<PlaylistDetailState, PlaylistDetailEvent, PlaylistDetailEffect>,
    topPadding: Dp,
    bottomPadding: Dp,
    onTogglePublic: () -> Unit,
    onCopyLink: (() -> Unit)?,
) {
```

Inside `EpisodeList`, update the `PlaylistHeader` call in the `item(key = "header")` block:

```kotlin
item(key = "header") {
    state.playlist?.let { playlist ->
        PlaylistHeader(
            artworkUrls = playlist.artworkUrls,
            name = playlist.name,
            episodeCount = playlist.episodeCount,
            isPublic = playlist.isPublic,
            onTogglePublic = onTogglePublic,
            onCopyLink = onCopyLink,
        )
    }
}
```

- [ ] **Step 8: Pass callbacks to `EpisodeList` at its call site**

In `PlaylistDetailScreen`, update the `EpisodeList` call in the `else` branch:

```kotlin
EpisodeList(
    state = state,
    feature = feature,
    topPadding = topPadding,
    bottomPadding = bottomPadding,
    onTogglePublic = onTogglePublic,
    onCopyLink = onCopyLink,
)
```

- [ ] **Step 9: Build and verify no unused imports remain**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. If there are unused import warnings for `Icons.Default.Lock` or `Icons.Default.LockOpen` (they're still used inside `PlaylistHeader`), no action needed. Remove any import for `LockOpen` or `Lock` only if the compiler errors.

- [ ] **Step 10: Commit**

```bash
cd mobile && git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/playlistdetail/PlaylistDetailScreen.kt
git commit -m "feat: wire public/private chip toggle and add Copy Link chip in playlist header"
```

---

## Task 4: `AppShell` deep link navigation

**Files:**
- Modify: `composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt`

- [ ] **Step 1: Add imports to `AppShell.kt`**

Add these imports alongside the existing ones:

```kotlin
import com.trilium.syncpods.deeplink.PendingDeepLink
import kotlinx.coroutines.flow.filterNotNull
```

- [ ] **Step 2: Inject `PendingDeepLink` and add deep link `LaunchedEffect`**

In `AppShell()`, after `val navController = rememberNavController()`, add:

```kotlin
val pendingDeepLink = koinInject<PendingDeepLink>()
```

After the existing `LaunchedEffect(Unit)` block (the one handling auth session status), add a second `LaunchedEffect(Unit)`:

```kotlin
LaunchedEffect(Unit) {
    pendingDeepLink.route.filterNotNull().collect { route ->
        navController.navigate(AppRoutes.Library.route) {
            launchSingleTop = true
            restoreState = true
        }
        navController.navigate(route)
        pendingDeepLink.consume()
    }
}
```

- [ ] **Step 3: Build and verify**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd mobile && git add composeApp/src/commonMain/kotlin/com/trilium/syncpods/shell/AppShell.kt
git commit -m "feat: handle pending deep link navigation in AppShell"
```

---

## Task 5: Android App Links (manifest + MainActivity)

**Files:**
- Modify: `composeApp/src/androidMain/AndroidManifest.xml`
- Modify: `composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt`

- [ ] **Step 1: Add App Links intent filter to `AndroidManifest.xml`**

Inside the `<activity>` element, after the existing `<intent-filter>` for `syncpods://auth`, add:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="syncpods.app" android:pathPrefix="/playlist/" />
</intent-filter>
```

- [ ] **Step 2: Add `PendingDeepLink` injection and `handlePlaylistIntent` to `MainActivity.kt`**

Add imports:

```kotlin
import com.trilium.syncpods.deeplink.PendingDeepLink
import com.trilium.syncpods.deeplink.parsePlaylistDeepLink
```

Add the injected property alongside `supabaseClient`:

```kotlin
private val pendingDeepLink: PendingDeepLink by inject()
```

Add `handlePlaylistIntent` call in `onCreate` after `handleAuthIntent(intent)`:

```kotlin
handleAuthIntent(intent)
handlePlaylistIntent(intent)
```

Add `handlePlaylistIntent` call in `onNewIntent` after `handleAuthIntent(intent)`:

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleAuthIntent(intent)
    handlePlaylistIntent(intent)
}
```

Add the new private function alongside `handleAuthIntent`:

```kotlin
private fun handlePlaylistIntent(intent: Intent) {
    val url = intent.data?.toString() ?: return
    val route = parsePlaylistDeepLink(url) ?: return
    pendingDeepLink.set(route)
}
```

- [ ] **Step 3: Build and verify**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd mobile && git add composeApp/src/androidMain/AndroidManifest.xml \
  composeApp/src/androidMain/kotlin/com/trilium/syncpods/MainActivity.kt
git commit -m "feat: handle App Links deep link for playlist on Android"
```

---

## Task 6: iOS unified deep link handler

**Files:**
- Modify: `composeApp/src/iosMain/kotlin/com/trilium/syncpods/AuthDeepLinkHandler.kt`
- Modify: `iosApp/iosApp/iOSApp.swift`

- [ ] **Step 1: Add `handleDeepLink` to `AuthDeepLinkHandler.kt`**

Add imports at the top of `AuthDeepLinkHandler.kt`:

```kotlin
import com.trilium.syncpods.deeplink.PendingDeepLink
import com.trilium.syncpods.deeplink.parsePlaylistDeepLink
import org.koin.core.context.GlobalContext
```

Add the new function at the bottom of the file, after the existing `handleAuthDeepLink`:

```kotlin
fun handleDeepLink(urlString: String) {
    val route = parsePlaylistDeepLink(urlString)
    if (route != null) {
        GlobalContext.get().get<PendingDeepLink>().set(route)
        return
    }
    val client = deepLinkClient ?: return
    val nsUrl = NSURL(string = urlString) ?: return
    GlobalScope.launch {
        try { client.handleDeeplinks(nsUrl) } catch (_: Exception) {}
    }
}
```

Keep `initAuthDeepLinkHandler` and `handleAuthDeepLink` unchanged — they're still called from `MainViewController.kt`.

- [ ] **Step 2: Update `iOSApp.swift` to call `handleDeepLink`**

In `iosApp/iosApp/iOSApp.swift`, change the `.onOpenURL` closure from:

```swift
.onOpenURL { url in
    AuthDeepLinkHandlerKt.handleAuthDeepLink(urlString: url.absoluteString)
}
```

to:

```swift
.onOpenURL { url in
    AuthDeepLinkHandlerKt.handleDeepLink(urlString: url.absoluteString)
}
```

- [ ] **Step 3: Build and verify**

```bash
cd mobile && ./gradlew :composeApp:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. (iOS build verification requires Xcode — the Kotlin compilation confirms the function signatures are correct.)

- [ ] **Step 4: Commit**

```bash
cd mobile && git add composeApp/src/iosMain/kotlin/com/trilium/syncpods/AuthDeepLinkHandler.kt \
  iosApp/iosApp/iOSApp.swift
git commit -m "feat: add unified handleDeepLink for iOS, routing playlist URLs to PendingDeepLink"
```

---

## Task 7: iOS Associated Domains entitlement

**Files:**
- Create: `iosApp/iosApp/iosApp.entitlements`

> **Note:** This task requires two manual steps in Xcode to take effect. Follow the steps below in order.

- [ ] **Step 1: Create the entitlements file**

```xml
<!-- iosApp/iosApp/iosApp.entitlements -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.associated-domains</key>
    <array>
        <string>applinks:syncpods.app</string>
    </array>
</dict>
</plist>
```

- [ ] **Step 2: Link the entitlements file in Xcode**

Open `iosApp/iosApp.xcodeproj` in Xcode. In the Project Navigator:
1. Select the `iosApp` project (top of the tree) → select the `iosApp` target → **Signing & Capabilities** tab
2. Click **+ Capability** and add **Associated Domains**
3. In the Associated Domains section, add: `applinks:syncpods.app`

Xcode will create and link the entitlements file automatically. If it creates a duplicate, delete the one you created manually and let Xcode manage it; the content must include `applinks:syncpods.app`.

Alternatively, if you prefer editing the Xcode project directly:
- In the **Build Settings** tab for the `iosApp` target, search for `CODE_SIGN_ENTITLEMENTS` and set it to `iosApp/iosApp.entitlements`.

- [ ] **Step 3: Commit**

```bash
cd mobile && git add iosApp/iosApp/iosApp.entitlements
git commit -m "feat: add Associated Domains entitlement for iOS Universal Links"
```

---

## Task 8: Web `.well-known` files + next.config.ts header

**Files:**
- Create: `web/public/.well-known/assetlinks.json`
- Create: `web/public/.well-known/apple-app-site-association`
- Modify: `web/next.config.ts`

> **Before deploying:** Fill in the two placeholder values:
> - **Android SHA-256**: Play Console → (your app) → Setup → App integrity → App signing key certificate → SHA-256 certificate fingerprint
> - **Apple Team ID**: [developer.apple.com](https://developer.apple.com) → Account → Membership details → Team ID

- [ ] **Step 1: Create the `.well-known` directory and `assetlinks.json`**

```json
// web/public/.well-known/assetlinks.json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.trilium.syncpods",
    "sha256_cert_fingerprints": [
      "PLACEHOLDER_SHA256 — replace with value from Play Console > Setup > App integrity > App signing key certificate"
    ]
  }
}]
```

- [ ] **Step 2: Create `apple-app-site-association`**

```json
// web/public/.well-known/apple-app-site-association
{
  "applinks": {
    "details": [{
      "appIDs": ["PLACEHOLDER_TEAM_ID.com.trilium.syncpods"],
      "components": [{ "/": "/playlist/*" }]
    }]
  }
}
```

Note: `apple-app-site-association` intentionally has no file extension. Apple's crawler fetches it from `https://syncpods.app/.well-known/apple-app-site-association`.

- [ ] **Step 3: Add `Content-Type` header for AASA in `next.config.ts`**

Replace the contents of `web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/.well-known/apple-app-site-association",
      headers: [{ key: "Content-Type", value: "application/json" }],
    },
  ],
};

export default nextConfig;
```

- [ ] **Step 4: Verify Next.js still starts**

```bash
cd web && npm run dev
```

Visit `http://localhost:3000/.well-known/apple-app-site-association` — should return the JSON with `Content-Type: application/json`.
Visit `http://localhost:3000/.well-known/assetlinks.json` — should return the JSON.

- [ ] **Step 5: Commit**

```bash
cd web && git add public/.well-known/assetlinks.json public/.well-known/apple-app-site-association next.config.ts
git commit -m "feat: add .well-known files and AASA content-type header for Universal Links / App Links"
```

---

## Post-implementation: Fill in placeholders and verify

- [ ] **Fill in Android SHA-256 fingerprint** in `web/public/.well-known/assetlinks.json`
- [ ] **Fill in Apple Team ID** in `web/public/.well-known/apple-app-site-association`
- [ ] **Deploy web changes** to production so Apple/Google crawlers can verify the files at `https://syncpods.app/.well-known/`
- [ ] **Android verification**: After deploying, run `adb shell pm get-app-links com.trilium.syncpods` on a debug device to confirm `VERIFIED` status (can take up to 20 seconds after install)
- [ ] **iOS verification**: Install a debug build on a device with Xcode, tap a `https://syncpods.app/playlist/{id}` link in Safari or Messages — should open the app directly to the playlist
