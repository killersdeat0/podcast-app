# Screen: Queue

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Reorderable list of episodes queued for playback; free tier capped at 10 items. Screen title shown to the user is **"Up Next"** (tab bar label remains "Queue").

## Contents
- "Up Next" screen title
- Free-tier cap pill badge (top-right): "X / 10 Free" — shows current count and cap
- Paid cap badge (top-right): **"Unlimited"** purple pill (replaces the "X / 10 Free" badge entirely)
- Episode cards, each row:
  - Six-dot drag handle on the **left**
  - Artwork thumbnail
  - Episode title (accent/blue color when currently playing) + podcast name + time remaining
  - Trash icon (delete) + three-dot menu on the **right**
  - Currently playing card has a play overlay on the thumbnail
- **Inline upgrade card** (shown proactively before hitting the cap — visible at 4/10 in design):
  - Heading: **"Queue Limit Reached Soon"**
  - Body: "Free users can only queue up to 10 episodes at a time. Upgrade for unlimited episodes and silence skipping."
  - CTA: **"View Plans" full-width button** — this is an inline list card, **not** a bottom sheet
- Empty state when queue is empty
- Mini player bar (persistent, above tab bar)

## Navigation
- **Arrives from:** Bottom tab bar (Queue tab)
- **Goes to:** Full Player (tap episode row) · Upgrade Sheet (tapping "View Plans" in the inline card) · Login Prompt Sheet (guest saves queue changes)

## Feature Gates
| Element | Free | Paid | Guest |
|---------|------|------|-------|
| Queue size | 10 | Unlimited | — |
| Cap badge | "X / 10 Free" pill | "Unlimited" purple pill | — |
| Inline upgrade card | ✓ (proactive, near cap) | — | — |
| Add beyond 10 | Upgrade Sheet | ✓ | — |
| Save changes | ✓ | ✓ | Login Prompt Sheet |

## Implementation

| File | Source Set |
|------|------------|
| `queue/QueueFeature.kt` | `commonMain` |
| `queue/QueueScreen.kt` | `commonMain` |
| `queue/QueueViewModel.kt` | `androidMain` |

**Key logic:** Reorder calls `PATCH /api/queue` with `{ orderedGuids }`. Cap enforcement happens in `QueueFeature` before accepting an `AddEpisode` event. Mirrors web queue patterns.
