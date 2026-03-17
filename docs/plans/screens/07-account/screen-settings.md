# Screen: Settings

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
App-wide settings and account management, reachable from the Profile screen.

## Contents
- Notification Settings → (navigates to Notification Settings screen)
- Playback defaults (default speed, skip interval)
- OPML import / export (paid only)
- Manage Subscription (opens platform billing — App Store / Play Store)
- Sign Out

## Navigation
- **Arrives from:** Profile
- **Goes to:** Notification Settings · Upgrade Sheet (free: OPML)

## Feature Gates
| Element | Free | Paid |
|---------|------|------|
| Playback defaults | ✓ | ✓ |
| OPML import / export | — | ✓ |
| Manage Subscription | ✓ | ✓ |

## Implementation

| File | Source Set |
|------|------------|
| `settings/SettingsFeature.kt` | `commonMain` |
| `settings/SettingsScreen.kt` | `commonMain` |
| `settings/SettingsViewModel.kt` | `androidMain` |

**Platform-specific:** "Manage Subscription" deep-links to platform billing:
- Android: `Intent` to Google Play subscriptions URL
- iOS: `UIApplication.open` to App Store subscription management URL
Use expect/actual `fun openSubscriptionManagement()`.
