# Screen: Queue

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
Reorderable list of episodes queued for playback; free tier capped at 10 items.

## Contents
- Reorderable episode rows (drag handles)
- Per-row actions: Play, Remove
- Progress bar on currently playing episode
- Empty state when queue is empty
- Cap indicator for free users ("10 / 10")

## Navigation
- **Arrives from:** Bottom tab bar (Queue tab)
- **Goes to:** Full Player (tap episode row) · Upgrade Sheet (attempt to add 11th episode — free) · Login Prompt Sheet (guest saves queue changes)

## Feature Gates
| Element | Free | Paid | Guest |
|---------|------|------|-------|
| Queue size | 10 | Unlimited | — |
| Add beyond 10 | Upgrade Sheet | ✓ | — |
| Save changes | ✓ | ✓ | Login Prompt Sheet |

## Implementation

| File | Source Set |
|------|------------|
| `queue/QueueFeature.kt` | `commonMain` |
| `queue/QueueScreen.kt` | `commonMain` |
| `queue/QueueViewModel.kt` | `androidMain` |

**Key logic:** Reorder calls `PATCH /api/queue` with `{ orderedGuids }`. Cap enforcement happens in `QueueFeature` before accepting an `AddEpisode` event. Mirrors web queue patterns.
