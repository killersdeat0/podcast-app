# Screen: Onboarding — Suggested Podcasts

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
Third onboarding step; shows a curated podcast list seeded by the user's chosen genres so they can subscribe before entering the app.

## Contents
- Headline: "Here are some picks for you"
- Lazy list of podcast cards filtered by selected genres
- Inline Subscribe / Unsubscribe toggle per card
- "Continue" CTA button (skippable — no subscriptions required)

## Navigation
- **Arrives from:** Onboarding — Genre Selection
- **Goes to:** Onboarding — Notification Permission

## Feature Gates
None.

## Implementation

| File | Source Set |
|------|------------|
| `onboarding/OnboardingPodcastsFeature.kt` | `commonMain` |
| `onboarding/OnboardingPodcastsScreen.kt` | `commonMain` |
| `onboarding/OnboardingPodcastsViewModel.kt` | `androidMain` |

**Key logic:** Calls the Supabase Edge Function (`/functions/v1/podcasts-search`) with each selected genre as a query; deduplicates results. Subscribe action writes to the `subscriptions` table directly.
