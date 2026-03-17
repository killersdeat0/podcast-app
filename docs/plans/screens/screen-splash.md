# Screen: Splash

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
First screen shown on launch; displays the app logo and auto-redirects based on auth state.

## Contents
- App logo / wordmark centered
- Optional animated intro (fade-in)
- No interactive elements

## Navigation
- **Arrives from:** App cold start
- **Goes to:** Auth Entry (unauthenticated) · App Shell / Discover (authenticated)

## Feature Gates
None — shown to all users regardless of tier or auth state.

## Implementation

| File | Source Set |
|------|------------|
| `splash/SplashFeature.kt` | `commonMain` |
| `splash/SplashScreen.kt` | `commonMain` |
| `splash/SplashViewModel.kt` | `androidMain` |

**Key logic:** `SplashFeature` calls the Supabase auth client on init; emits a `NavigateToShell` or `NavigateToAuthEntry` effect based on the session result.
