# Playlist Visibility Toggle + Copy Link

**Date:** 2026-05-04  
**Status:** Approved

## Overview

Make the Public/Private chip in `PlaylistDetailScreen` functional (toggle playlist visibility), and add a "Copy Link" chip that copies a shareable deep link to the clipboard. The link uses the web URL format (`https://syncpods.app/playlist/{id}`) and deep links into the app on devices with it installed.

---

## Section 1 — UI Changes

### `PlaylistHeader`

- Add `onTogglePublic: () -> Unit` callback
- Add `onCopyLink: (() -> Unit)?` callback (null when playlist is private)
- The existing `AssistChip` (`onClick = {}`) becomes `onClick = onTogglePublic`
- A second `AssistChip` with a link icon and "Copy Link" label is added immediately after, only rendered when `onCopyLink != null`
- Both chips are laid out in a `Row` with `Arrangement.spacedBy`

### `PlaylistDetailScreen`

- Acquire `LocalClipboardManager.current` and the existing `coroutineScope`
- Add a `SnackbarHostState` and `SnackbarHost` in the `Scaffold` for "Link copied" feedback
- Build `onCopyLink` lambda: writes `https://syncpods.app/playlist/{playlistId}` via `clipboardManager.setText(AnnotatedString(...))` and shows a "Link copied" snackbar
- Pass `onTogglePublic` and `onCopyLink` into `PlaylistHeader` via both the empty-state path and through `EpisodeList` for the loaded-episodes path
- `EpisodeList` gains two new params: `onTogglePublic: () -> Unit` and `onCopyLink: (() -> Unit)?`
- **Remove the lock icon from the top app bar** — the chip is now the canonical toggle

### Clipboard

Uses `LocalClipboardManager` from Compose Multiplatform — no `expect/actual` needed; works cross-platform.

---

## Section 2 — URL + Platform Deep Link Config

### Copied URL format

```
https://syncpods.app/playlist/{id}
```

### Android — App Links (`AndroidManifest.xml`)

Add a second intent filter to `MainActivity`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="syncpods.app" android:pathPrefix="/playlist/" />
</intent-filter>
```

### iOS — Associated Domains

- Create `iosApp/iosApp/iosApp.entitlements` with `com.apple.developer.associated-domains` → `applinks:syncpods.app`
- Reference the entitlements file in the Xcode project (Code Signing Entitlements build setting)

### Web — `.well-known` files

Add two files at `web/public/.well-known/`:

**`assetlinks.json`** (Android App Links verification):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.trilium.syncpods",
    "sha256_cert_fingerprints": ["PLACEHOLDER — fill in from Play Console > App signing"]
  }
}]
```

**`apple-app-site-association`** (iOS Universal Links):
```json
{
  "applinks": {
    "details": [{
      "appIDs": ["PLACEHOLDER_TEAM_ID.com.trilium.syncpods"],
      "components": [{ "/": "/playlist/*" }]
    }]
  }
}
```

`apple-app-site-association` must be served as `application/json`. Add a `next.config` header rule for this path.

**Required values to fill in before shipping:**
- Android: SHA-256 release signing cert fingerprint (Play Console → Setup → App integrity → App signing key certificate)
- iOS: Apple Team ID (developer.apple.com → Membership)

---

## Section 3 — In-app Deep Link Navigation

### `PendingDeepLink` (commonMain)

Koin singleton wrapping a `MutableStateFlow<String?>`:

```kotlin
class PendingDeepLink {
    private val _route = MutableStateFlow<String?>(null)
    val route: StateFlow<String?> = _route.asStateFlow()
    fun set(route: String) { _route.value = route }
    fun consume() { _route.value = null }
}
```

Registered as `single { PendingDeepLink() }` in `AppModule`.

### `parsePlaylistDeepLink` (commonMain)

Pure function:
```kotlin
fun parsePlaylistDeepLink(url: String): String? {
    val prefix = "https://syncpods.app/playlist/"
    return if (url.startsWith(prefix)) {
        val id = url.removePrefix(prefix).trimEnd('/')
        if (id.isNotBlank()) "playlist/$id" else null
    } else null
}
```

### Android — `MainActivity`

After `handleAuthIntent(intent)`, also call a new `handlePlaylistIntent(intent)`:
```kotlin
private fun handlePlaylistIntent(intent: Intent) {
    val url = intent.data?.toString() ?: return
    val route = parsePlaylistDeepLink(url) ?: return
    get<PendingDeepLink>().set(route)
}
```

Called from both `onCreate` and `onNewIntent`.

### iOS — `handleDeepLink` (iosMain)

Replace `handleAuthDeepLink` with a unified `handleDeepLink(urlString: String)`:

```kotlin
fun handleDeepLink(urlString: String) {
    val route = parsePlaylistDeepLink(urlString)
    if (route != null) {
        GlobalContext.get().get<PendingDeepLink>().set(route)
        return
    }
    // fall through to auth handler
    val client = deepLinkClient ?: return
    val nsUrl = NSURL(string = urlString) ?: return
    GlobalScope.launch { try { client.handleDeeplinks(nsUrl) } catch (_: Exception) {} }
}
```

### `iOSApp.swift`

Change `.onOpenURL` to call `handleDeepLink` instead of `handleAuthDeepLink`:
```swift
.onOpenURL { url in
    DeepLinkHandlerKt.handleDeepLink(urlString: url.absoluteString)
}
```

### `AppShell`

Inject `PendingDeepLink` via `koinInject()`. Add a `LaunchedEffect(Unit)` that collects `pendingDeepLink.route`:

```kotlin
LaunchedEffect(Unit) {
    pendingDeepLink.route.filterNotNull().collect { route ->
        // Switch to Library tab so back stack is correct
        navController.navigate(AppRoutes.Library.route) {
            launchSingleTop = true
            restoreState = true
        }
        navController.navigate(route)
        pendingDeepLink.consume()
    }
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `PlaylistDetailScreen.kt` | Chip callbacks, Copy Link chip, snackbar, remove top bar lock icon |
| `PlaylistDetailFeature.kt` | No changes needed |
| `PlaylistModels.kt` | No changes needed |
| `AppShell.kt` | Inject `PendingDeepLink`, add deep link nav LaunchedEffect |
| `AppModule.kt` | Register `PendingDeepLink` singleton |
| `AndroidManifest.xml` | Add App Links intent filter |
| `MainActivity.kt` | Handle playlist deep link from intent |
| `AuthDeepLinkHandler.kt` (iosMain) | Extend into unified `handleDeepLink` |
| `iOSApp.swift` | Call `handleDeepLink` instead of `handleAuthDeepLink` |
| `iosApp.entitlements` (new) | Associated Domains entitlement |
| `web/public/.well-known/assetlinks.json` (new) | Android App Links verification |
| `web/public/.well-known/apple-app-site-association` (new) | iOS Universal Links |
| `web/next.config.*` | Add `Content-Type: application/json` header for AASA |

## Out of Scope

- Public playlist web view (a guest visiting `syncpods.app/playlist/{id}` in a browser without the app) — separate feature
- Deep links for other entity types (podcasts, episodes)
