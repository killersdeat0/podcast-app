# Screen: Auth Entry

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Landing screen for unauthenticated users; presents sign-in, sign-up, and guest options.

## Contents
- App logo / branding header
- "Sign In" button → Login
- "Create Account" button → Sign Up
- "Continue as Guest" button → App Shell
- Google OAuth button
- Apple Sign-In button (iOS only — expect/actual)

## Navigation
- **Arrives from:** Splash (unauthenticated)
- **Goes to:** Login · Sign Up · App Shell (guest)

## Feature Gates
None — all options visible to everyone.

## Implementation

| File | Source Set |
|------|------------|
| `auth/AuthEntryFeature.kt` | `commonMain` |
| `auth/AuthEntryScreen.kt` | `commonMain` |
| `auth/AuthEntryViewModel.kt` | `androidMain` |

**Platform-specific:** Apple Sign-In button is iOS-only. Use `expect fun buildAuthButtons()` or a conditional `if (platform == iOS)` approach backed by expect/actual OAuth handler.
