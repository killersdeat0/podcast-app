# Screen: Sign Up

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
New account creation via email + password or OAuth.

## Contents
- Email text field
- Password text field (masked)
- "Create Account" submit button
- Google OAuth button
- Apple Sign-In button (iOS only)
- Inline error message on failure

## Navigation
- **Arrives from:** Auth Entry
- **Goes to:** Onboarding — Welcome (on success)

## Feature Gates
None.

## Implementation

| File | Source Set |
|------|------------|
| `auth/SignUpFeature.kt` | `commonMain` |
| `auth/SignUpScreen.kt` | `commonMain` |
| `auth/SignUpViewModel.kt` | `androidMain` |

**Key logic:** `SignUpFeature` calls Supabase `signUpWithEmail`; on success emits `NavigateToOnboarding` effect to begin the onboarding flow.
