# Screen: Onboarding — Welcome

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
First step of the post-signup onboarding flow; short app intro with a "Get started" CTA.

## Contents
- Illustrative hero graphic or animation
- Short welcome headline and tagline
- "Get started" CTA button

## Navigation
- **Arrives from:** Sign Up (on success)
- **Goes to:** Onboarding — Genre Selection

## Feature Gates
None — only shown to new sign-ups.

## Implementation

| File | Source Set |
|------|------------|
| `onboarding/OnboardingWelcomeFeature.kt` | `commonMain` |
| `onboarding/OnboardingWelcomeScreen.kt` | `commonMain` |
| `onboarding/OnboardingWelcomeViewModel.kt` | `androidMain` |

**Note:** Onboarding screens may share a single `OnboardingFeature` with a step-based state machine rather than separate features per step — decide at implementation time.
