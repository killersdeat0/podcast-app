# Sheet: Login Prompt

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Inline bottom sheet shown to guest users when they attempt an action that requires an account; encourages sign-up without a hard redirect.

## Contents
- Brief message explaining why an account is needed (contextual — e.g. "Sign in to subscribe")
- "Sign In" button → navigates to Auth Entry
- "Create Account" button → navigates to Sign Up
- "Not now" dismiss link

## Trigger Points
| Screen | Trigger |
|--------|---------|
| Podcast Detail | Guest taps Subscribe |
| Queue | Guest attempts to save queue changes |
| Profile tab | Guest taps Profile tab |

## Navigation
- **Triggered from:** Any screen listed above (sheet overlays current screen)
- **"Sign In":** Navigates to Auth Entry / Login
- **"Create Account":** Navigates to Auth Entry / Sign Up
- **Dismisses to:** Same screen (guest stays in guest mode)

## Feature Gates
Only shown to unauthenticated (guest) users.

## Implementation

| File | Source Set |
|------|------------|
| `auth/LoginPromptSheet.kt` | `commonMain` (composable, no Feature needed) |

**Key logic:** Accepts a `reason: LoginPromptReason` parameter to customise the message text. After sign-in/sign-up the user is returned to the screen they were on (pass back-stack destination as a parameter or use navigation result).
