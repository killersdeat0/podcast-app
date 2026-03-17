# Screen: Profile

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
User account hub showing tier info, subscriptions, listening stats, and account actions.

## Contents
- Account info (email, avatar placeholder)
- Tier badge (Free / Pro)
- Subscriptions list (read-only; tap to go to Podcast Detail)
- Listening stats summary (paid only — full stats via Stats screen)
- Upgrade CTA banner (free tier)
- Settings link
- Sign Out button

## Navigation
- **Arrives from:** Bottom tab bar (Profile tab) · Guest tap on Profile tab → Login Prompt Sheet
- **Goes to:** Settings · Stats (paid only) · Upgrade Sheet (free upgrade CTA)

## Feature Gates
| Element | Free | Paid | Guest |
|---------|------|------|-------|
| Account info | ✓ | ✓ | Login Prompt Sheet |
| Listening stats | — | ✓ | — |
| Upgrade CTA | ✓ | — | — |

## Implementation

| File | Source Set |
|------|------------|
| `profile/ProfileFeature.kt` | `commonMain` |
| `profile/ProfileScreen.kt` | `commonMain` |
| `profile/ProfileViewModel.kt` | `androidMain` |

**Key logic:** Guest detection in `ProfileFeature` emits `ShowLoginPrompt` effect before loading any data. Tier badge derived from `subscriptions` table row existence.
