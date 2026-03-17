# Screen: Stats

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Listening analytics for paid subscribers; accessible from the Profile screen.

## Contents
- Total listening time (all-time)
- Episodes completed per week chart (bar chart)
- Listening streak (consecutive days with playback)
- Placeholder / upgrade CTA shown to free users who navigate here

## Navigation
- **Arrives from:** Profile (paid only)
- **Goes to:** Upgrade Sheet (if a free user somehow reaches this screen)

## Feature Gates
| Element | Free | Paid |
|---------|------|------|
| Entire screen | — (gated at Profile) | ✓ |

## Implementation

| File | Source Set |
|------|------------|
| `stats/StatsFeature.kt` | `commonMain` |
| `stats/StatsScreen.kt` | `commonMain` |
| `stats/StatsViewModel.kt` | `androidMain` |

**Key logic:** Queries `playback_progress` table (filtered to `completed = true` or `listened_seconds > 0`). Aggregates in `StatsFeature` using Kotlin. Chart rendered with a Compose canvas or a KMP-compatible charting library.
