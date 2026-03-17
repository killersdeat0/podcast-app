# Screen: Login

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Email + password sign-in form with OAuth alternatives and a forgot-password escape hatch.

## Contents
- Back arrow (top-left)
- "Welcome back" heading
- Subtitle: "Sign in to sync your podcasts, history, and queue across devices."
- Email address field (envelope icon prefix)
- Password field (lock icon prefix, masked)
- "Forgot password?" link (right-aligned, below password)
- "Sign In" primary button (full-width, white)
- "OR CONTINUE WITH" divider
- Google button (full-width, dark surface)
- Apple button (full-width, dark surface)
- "Don't have an account? **Sign up**" footer link
- Inline error message on failure

## Navigation
- **Arrives from:** Login Prompt Sheet · "Don't have an account?" link on Sign Up screen · back from any auth screen
- **Goes to:** App Shell / Discover (on success) · Sign Up ("Sign up" footer link)

## Feature Gates
None.

## Implementation

| File | Source Set |
|------|------------|
| `auth/LoginFeature.kt` | `commonMain` |
| `auth/LoginScreen.kt` | `commonMain` |
| `auth/LoginViewModel.kt` | `androidMain` |

**Key logic:** `LoginFeature` calls Supabase `signInWithPassword`; on success emits `NavigateToShell` effect; on error emits `ShowError` effect with the Supabase error message.
