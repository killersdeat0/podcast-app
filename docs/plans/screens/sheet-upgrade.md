# Sheet: Upgrade

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
Inline bottom sheet shown whenever a free-tier user hits a paid feature gate; presents the feature benefit list and a Subscribe CTA without requiring full-screen navigation.

## Contents
- Feature unlock headline (contextual — e.g. "Unlock unlimited queue")
- Bullet list of paid features
- Pricing: $4.99/month or $50/year
- "Subscribe" primary CTA button → triggers in-app purchase
- "Not now" dismiss link

## Trigger Points
| Screen | Trigger |
|--------|---------|
| Queue | Attempt to add 11th episode |
| Player | Tap silence skip toggle |
| Player | Attempt speed outside 1x/2x |
| Podcast Detail | Tap episode filter |
| Library | 4th download in a day |
| Profile | Upgrade CTA banner |

## Navigation
- **Triggered from:** Any screen listed above (no navigation; sheet overlays the current screen)
- **Dismisses to:** Same screen the user was on

## Feature Gates
Only shown to free-tier authenticated users (not guests).

## Implementation

| File | Source Set |
|------|------------|
| `upgrade/UpgradeSheet.kt` | `commonMain` (composable, no Feature needed) |

**Key logic:** Accepts a `feature: GatedFeature` parameter to customise the headline. In-app purchase flow is platform-specific:
- Android: Google Play Billing Library via expect/actual `PurchaseManager`
- iOS: StoreKit 2 via expect/actual `PurchaseManager`

Subscription price IDs must match those configured in the Play Console / App Store Connect.
