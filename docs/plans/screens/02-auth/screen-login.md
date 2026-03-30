# Screen: Login

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description

Full-screen email/password sign-in form with Google OAuth. Replaces the `LoginPromptSheet` on the Profile screen. Session persists across app restarts via the Supabase Auth plugin. Sign Up screen is deferred.

## Layout

```
TopAppBar (back arrow — top-left)
  "Sign In"                            ← headlineMedium
  "Don't have an account? Sign up"     ← bodyMedium; "Sign up" in primary color (stub, no nav yet)
  [Email OutlinedTextField]
  [Password OutlinedTextField]         ← show/hide toggle; ImeAction.Done triggers sign-in
  "Forgot password?"                   ← align end, primary color (stub, no nav yet)
  [Error text]                         ← error color, visible when state.error != null
  [Sign In Button]                     ← full-width; CircularProgressIndicator while loading
  ─────────── OR ───────────
  [Continue with Google OutlinedButton]
  [Continue without signing in TextButton]   ← calls onBack
```

## Navigation

- **Arrives from:** Profile screen "Sign In / Sign Up" button · (future) Login Prompt Sheet on any screen
- **Goes to:** Profile (on success, `popBackStack`) · Sign Up screen ("Sign up" stub, not yet implemented)

## Feature Gates

None.

---

## Implementation

### New Files

| File | Source Set |
|------|------------|
| `login/LoginRepository.kt` | `commonMain` |
| `login/LoginFeature.kt` | `commonMain` |
| `login/LoginViewModel.kt` | `commonMain` |
| `login/LoginScreen.kt` | `commonMain` |

### Modified Files

| File | Change |
|------|--------|
| `gradle/libs.versions.toml` | Add `supabase-compose-auth`, Android credential libs |
| `composeApp/build.gradle.kts` | Add deps to `commonMain` / `androidMain`; add `GOOGLE_WEB_CLIENT_ID` to `BuildConfig` |
| `androidMain/SupabaseClient.android.kt` | Install `ComposeAuth` with `googleNativeLogin(serverClientId)` |
| `iosMain/SupabaseClient.ios.kt` | Install `ComposeAuth` |
| `navigation/AppRoutes.kt` | Add `data object Login : AppRoutes("login")` |
| `profile/ProfileFeature.kt` | Emit `NavigateToSignIn` effect instead of `showLoginPrompt` state |
| `profile/ProfileScreen.kt` | Add `onNavigateToSignIn` callback; remove `LoginPromptSheet` |
| `shell/AppShell.kt` | Register Login route; Profile composable uses `repeatOnLifecycle(RESUMED)` for reload |
| `di/AppModule.kt` | Register `LoginRepository` and `LoginViewModel` |

---

## LoginRepository

```kotlin
interface LoginRepository {
    suspend fun signIn(email: String, password: String)
}

class LoginRepositoryImpl(private val supabaseClient: SupabaseClient) : LoginRepository {
    override suspend fun signIn(email: String, password: String) {
        supabaseClient.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }
}
```

Google Sign-In is handled by `rememberSignInWithGoogle` in the composable (compose-auth handles the Supabase sign-in internally — no repository method needed).

---

## LoginFeature

```kotlin
data class LoginState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

sealed class LoginEvent {
    data class EmailChanged(val value: String) : LoginEvent()
    data class PasswordChanged(val value: String) : LoginEvent()
    data object SignInTapped : LoginEvent()
    data object BackTapped : LoginEvent()
    data class GoogleSignInFailed(val message: String) : LoginEvent()
}

sealed class LoginAction {
    data class UpdateEmail(val value: String) : LoginAction()
    data class UpdatePassword(val value: String) : LoginAction()
    data object AttemptSignIn : LoginAction()
    data object NavigateBack : LoginAction()
    data class SetError(val message: String) : LoginAction()
}

sealed class LoginResult {
    data class EmailUpdated(val value: String) : LoginResult()
    data class PasswordUpdated(val value: String) : LoginResult()
    data object SignInStarted : LoginResult()
    data class SignInFailed(val message: String) : LoginResult()
    data object SignInSucceeded : LoginResult()
}

sealed class LoginEffect {
    data object NavigateBack : LoginEffect()
}
```

Key behaviors:
- `AttemptSignIn`: emit `SignInStarted` → `repository.signIn(email, password)` → success: `SignInSucceeded` + emit `NavigateBack` effect; failure: `SignInFailed(e.message)`
- `NavigateBack`: emit `NavigateBack` effect
- `GoogleSignInFailed(message)`: maps to `SetError(message)` → `SignInFailed(message)` result
- `state.value.email/password` read at action-processing time (safe — field updates are applied before `AttemptSignIn`)
- Double-tap protection via `enabled = !state.isLoading` on the Sign In button

---

## Google Sign-In (compose-auth)

### Dependency additions

`libs.versions.toml`:
```toml
supabase-compose-auth = { module = "io.github.jan-tennert.supabase:compose-auth", version.ref = "supabase" }
credentials = { module = "androidx.credentials:credentials", version = "1.5.0" }
credentials-play-services = { module = "androidx.credentials:credentials-play-services-auth", version = "1.5.0" }
googleid = { module = "com.google.android.libraries.identity.googleid:googleid", version = "1.1.1" }
```

`build.gradle.kts`:
```kotlin
// commonMain
implementation(libs.supabase.compose.auth)

// androidMain
implementation(libs.credentials)
implementation(libs.credentials.play.services)
implementation(libs.googleid)
```

### Supabase client changes

`SupabaseClient.android.kt` — add `ComposeAuth`:
```kotlin
install(ComposeAuth) {
    googleNativeLogin(serverClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID)
}
```

`SupabaseClient.ios.kt` — add `ComposeAuth` (no serverClientId; reads from Info.plist):
```kotlin
install(ComposeAuth)
```

Add to `android { defaultConfig { } }` in `build.gradle.kts`:
```kotlin
buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${localProperties["GOOGLE_WEB_CLIENT_ID"] ?: ""}\"")
```

### In LoginScreen

```kotlin
val supabaseClient = koinInject<SupabaseClient>()
val googleSignIn = rememberSignInWithGoogle(
    supabaseClient = supabaseClient,
    onResult = { result ->
        when (result) {
            NativeSignInResult.Success -> onBack()
            is NativeSignInResult.Error -> feature.process(LoginEvent.GoogleSignInFailed(result.message))
            is NativeSignInResult.NetworkError -> feature.process(LoginEvent.GoogleSignInFailed(result.message))
            NativeSignInResult.ClosedByUser -> {}
        }
    }
)
// Button:
OutlinedButton(onClick = { googleSignIn.startFlow() }, ...) { Text("Continue with Google") }
```

### External setup required (before Google Sign-In works at runtime)

1. **Google Cloud Console**: Create Web OAuth 2.0 Client ID (+ Android Client ID with SHA-1 fingerprint)
2. **`local.properties`**: `GOOGLE_WEB_CLIENT_ID=<web-client-id>`
3. **Supabase Dashboard**: Auth → Providers → Google → add Web Client ID, enable
4. **iOS Xcode**: Add `GoogleSignIn` Swift package; add `GIDClientID` + `CFBundleURLTypes` (REVERSED_CLIENT_ID) to `Info.plist`; forward `openURL` to `GIDSignIn.sharedInstance.handle(url)` in app entry point

Google button will gracefully surface an error until external setup is complete.

---

## Profile Screen changes

`ProfileFeature.kt` — remove prompt state, emit effect instead:
- Remove `showLoginPrompt: Boolean` from `ProfileState`
- Remove `LoginPromptShown`, `LoginPromptDismissed` results; `DismissLoginPrompt` action; `LoginPromptDismissed` event
- Change `NavigateToSignIn` action to `_effects.emit(ProfileEffect.NavigateToSignIn)`

`ProfileScreen.kt`:
- Add `onNavigateToSignIn: () -> Unit` parameter
- Remove `feature.process(ProfileEvent.ScreenVisible)` from `LaunchedEffect(Unit)` (AppShell owns this)
- Wire `ProfileEffect.NavigateToSignIn -> onNavigateToSignIn()`
- Remove `LoginPromptSheet` modal block

---

## AppShell changes

```kotlin
// isFullScreenRoute
|| currentDestination?.route == AppRoutes.Login.route

// Profile composable — reloads on resume (e.g. after returning from Login)
composable(AppRoutes.Profile.route) {
    val viewModel = koinViewModel<ProfileViewModel>()
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            viewModel.feature.process(ProfileEvent.ScreenVisible)
        }
    }
    ProfileScreen(
        feature = viewModel.feature,
        onNavigateToPodcast = { feedUrl -> navController.navigate("podcast/${feedUrl.encodeURLPathPart()}") },
        onNavigateToSettings = { navController.navigate(AppRoutes.Settings.route) },
        onNavigateToSignIn = { navController.navigate(AppRoutes.Login.route) },
        modifier = Modifier.padding(top = innerPadding.calculateTopPadding()),
        bottomContentPadding = innerPadding.calculateBottomPadding(),
    )
}

// Login composable
composable(AppRoutes.Login.route) {
    val viewModel = koinViewModel<LoginViewModel>()
    LoginScreen(
        feature = viewModel.feature,
        onBack = { navController.popBackStack() },
    )
}
```

Why `repeatOnLifecycle(RESUMED)`: Profile's `LaunchedEffect(Unit)` won't re-fire when navigating back from Login. `repeatOnLifecycle(RESUMED)` re-runs each time the Profile destination becomes active (initial visit + return from Login). ProfileScreen's `LaunchedEffect(Unit)` is kept only for effects collection.

---

## Implementation Order

1. `gradle/libs.versions.toml` + `build.gradle.kts`
2. `SupabaseClient.android.kt` + `SupabaseClient.ios.kt`
3. `login/LoginRepository.kt`
4. `login/LoginFeature.kt`
5. `login/LoginViewModel.kt`
6. `login/LoginScreen.kt`
7. `navigation/AppRoutes.kt`
8. `profile/ProfileFeature.kt`
9. `profile/ProfileScreen.kt`
10. `shell/AppShell.kt`
11. `di/AppModule.kt`

---

## Verification

1. `./gradlew :composeApp:assembleDebug` — clean build
2. Guest taps "Sign In / Sign Up" → Login screen opens full-screen, bottom nav hidden
3. Back button on Login → returns to Profile (no crash, still guest)
4. Valid credentials → loading indicator → pops back → Profile shows logged-in state
5. Invalid credentials → error message appears, button re-enables
6. Relaunch app after sign-in → Profile loads as logged-in (Supabase session persisted)
7. After Google external setup: tap "Continue with Google" → native consent sheet → success → Profile reloads logged-in
