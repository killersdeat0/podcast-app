# Screen: Onboarding — Notification Permission

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Final onboarding step; explains why notifications are useful and triggers the OS permission prompt.

## Contents
- Icon / illustration for notifications
- Context message explaining the value of episode alerts
- "Allow notifications" primary button → triggers OS permission dialog
- "Not now" secondary link → skips to App Shell

## Navigation
- **Arrives from:** Onboarding — Suggested Podcasts
- **Goes to:** App Shell / Discover

## Feature Gates
None — permission prompt shown to all new users.

## Implementation

| File | Source Set |
|------|------------|
| `onboarding/OnboardingNotificationsFeature.kt` | `commonMain` |
| `onboarding/OnboardingNotificationsScreen.kt` | `commonMain` |
| `onboarding/OnboardingNotificationsViewModel.kt` | `androidMain` |

**Platform-specific:** OS permission request is platform-specific.
- Android: `ActivityCompat.requestPermissions(POST_NOTIFICATIONS)` via expect/actual
- iOS: `UNUserNotificationCenter.requestAuthorization` via expect/actual

Define `expect fun requestNotificationPermission(onResult: (Boolean) -> Unit)` in `commonMain`.
