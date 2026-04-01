# Screen: History

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description

Playback history showing all episodes the user has interacted with, grouped by date or filtered to in-progress episodes only.

## Contents

- "History" screen title
- **Filter tabs:** "All" · "In Progress" (pill toggle in header row)
- **All view:** Episodes grouped by date bucket — Today · Yesterday · This week · Earlier
- **In Progress view:** Flat list of episodes where `position_seconds > 30`, `!completed`, and `position_pct < 98`; sorted by most-recently-played (`updated_at` desc). No date grouping.
- Episode rows (both views):
  - Artwork thumbnail
  - Episode title + podcast name + duration
  - Progress bar overlay (shows partial completion)
  - "✓ Played" badge when completed
  - Tap → resumes playback from saved position
- Empty states for both views

## Navigation

- **Arrives from:** Bottom tab bar (History/Library tab) · "See all →" link on Discover's Continue Listening section
- **In Progress deep-link:** `/history?filter=in_progress` (mobile equivalent: navigate to History with `filter=in_progress` param)
- **Goes to:** Full Player (tap episode)

## Feature Gates

| Element | Free | Paid | Guest |
|---------|------|------|-------|
| View history | ✓ | ✓ | — (redirects to login) |
| In Progress filter | ✓ | ✓ | — |

## Implementation

| File | Source Set |
|------|------------|
| `history/HistoryFeature.kt` | `commonMain` |
| `history/HistoryScreen.kt` | `commonMain` |
| `history/HistoryViewModel.kt` | `androidMain` |

**Key logic:** Fetches from `/api/history`. `isInProgress()` shared predicate (`position_seconds > 30 && !completed && position_pct < 98`) mirrors the web utility in `src/lib/player/constants.ts`. Filter state is passed as a navigation argument, not persisted.
