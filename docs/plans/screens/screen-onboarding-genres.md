# Screen: Onboarding — Genre Selection

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
Second onboarding step; user picks podcast genre interests to personalise suggested podcasts.

## Contents
- Headline: "What do you like listening to?"
- Multi-select interest chips (Comedy, Tech, News, True Crime, Sports, etc.)
- "Continue" CTA button (enabled once ≥1 genre selected)

## Navigation
- **Arrives from:** Onboarding — Welcome
- **Goes to:** Onboarding — Suggested Podcasts

## Feature Gates
None.

## Implementation

| File | Source Set |
|------|------------|
| `onboarding/OnboardingGenresFeature.kt` | `commonMain` |
| `onboarding/OnboardingGenresScreen.kt` | `commonMain` |
| `onboarding/OnboardingGenresViewModel.kt` | `androidMain` |

**Key logic:** Selected genres are stored locally (in-memory or DataStore) and passed to the Suggested Podcasts step to seed the curated list query.
