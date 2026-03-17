# Screen: Settings

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
App-wide settings and account management, reachable from the Profile screen.

## Contents

**Back arrow + "Settings" title**

**PREFERENCES section**
- Notification Settings row (bell icon, chevron →)
- Playback Defaults row (sliders icon, chevron →)

**DATA & ACCOUNT section**
- OPML Import/Export row (file icon, lock icon to indicate paid-only, chevron →)
- Manage Subscription row (card icon, chevron →)
- Sign Out row (arrow icon, destructive red label)

**App version footer:** "Podcast App v1.0.0 (Build 42)"

## Navigation
- **Arrives from:** Profile (gear icon)
- **Goes to:** Notification Settings · Playback Defaults · Upgrade Sheet (free: OPML tap) · platform billing (Manage Subscription) · Login screen (after Sign Out)

## Feature Gates
| Element | Free | Paid |
|---------|------|------|
| Notification Settings | ✓ | ✓ |
| Playback Defaults | ✓ | ✓ |
| OPML Import/Export | Lock icon shown; Upgrade Sheet on tap | ✓ |
| Manage Subscription | ✓ | ✓ |
| Sign Out | ✓ | ✓ |

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
