# Screen: Login

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Email + password sign-in form with OAuth alternatives and a forgot-password escape hatch.

## Contents
- Email text field
- Password text field (masked)
- "Sign In" submit button
- Google OAuth button
- Apple Sign-In button (iOS only)
- "Forgot password?" link
- Inline error message on failure

## Navigation
- **Arrives from:** Login Prompt Sheet
- **Goes to:** App Shell / Discover (on success)

## Feature Gates
None.

## Implementation

| File | Source Set |
|------|------------|
| `auth/LoginFeature.kt` | `commonMain` |
| `auth/LoginScreen.kt` | `commonMain` |
| `auth/LoginViewModel.kt` | `androidMain` |

**Key logic:** `LoginFeature` calls Supabase `signInWithPassword`; on success emits `NavigateToShell` effect; on error emits `ShowError` effect with the Supabase error message.
