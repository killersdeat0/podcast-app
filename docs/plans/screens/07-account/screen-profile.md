# Screen: Profile

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
User account hub showing tier info, subscriptions, listening stats, and upgrade CTA. Accessible to guests — no redirect to Login Prompt Sheet.

## Contents

### Guest state
- "Profile" screen title + gear icon (top-right → Settings)
- Circular avatar placeholder with sign-in arrow icon
- "Guest User" label
- "Sign in to sync your podcasts" subtitle
- "Sign In / Sign Up" button (full-width)
- Premium Subscription card (purple/blue gradient): crown icon, feature list, "Upgrade for $4.99/mo" button

### Logged-in state
- "Profile" screen title + gear icon (top-right → Settings)
- Circular avatar (photo or initials placeholder)
- Display name + email
- Tier badge: "FREE PLAN" or "PRO" (below email)
- "Your Subscriptions" section heading + "View All" link → subscriptions shown as horizontal scroll of podcast artwork
- Upgrade to Premium card (free tier only): feature bullet list, "Subscribe for $4.99/mo" button
- Listening Stats section (scrollable; free users see locked/teaser state, paid users see actual data)
- *(No Sign Out button — Sign Out is in Settings)*

## Navigation
- **Arrives from:** Bottom tab bar (Profile tab)
- **Goes to:** Settings (gear icon) · Login screen (guest "Sign In / Sign Up") · Podcast Detail (tap subscription) · Upgrade Sheet (upgrade CTA)

## Feature Gates
| Element | Free | Paid | Guest |
|---------|------|------|-------|
| View profile / subscriptions | ✓ | ✓ | Inline sign-in prompt |
| Listening stats | Teaser/locked | ✓ | — |
| Upgrade CTA card | ✓ | — | ✓ |

## Implementation

| File | Source Set |
|------|------------|
| `profile/ProfileFeature.kt` | `commonMain` |
| `profile/ProfileScreen.kt` | `commonMain` |
| `profile/ProfileViewModel.kt` | `androidMain` |

**Key logic:** `ProfileFeature` loads data for all user states; guest state is determined from session check and renders the inline sign-in prompt rather than redirecting. Tier badge derived from `subscriptions` table row existence. Subscriptions horizontal scroll loads same data as Library but read-only.
