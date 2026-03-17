# Screen: Library

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
User's personal podcast collection and downloaded episodes, with drag-to-reorder support.

## Contents
- Subscribed podcasts list (drag-to-reorder handles)
- Downloads section below subscriptions
  - Downloaded episode rows with offline badge
  - Delete download swipe action
- Empty state when no subscriptions

## Navigation
- **Arrives from:** Bottom tab bar (Library tab)
- **Goes to:** Podcast Detail (tap any podcast) · Upgrade Sheet (4th download/day — free tier)

## Feature Gates
| Element | Free | Paid |
|---------|------|------|
| View subscriptions | ✓ | ✓ |
| Downloads | 3/day | Unlimited |
| Exceeding download quota | Upgrade Sheet | — |

## Implementation

| File | Source Set |
|------|------------|
| `library/LibraryFeature.kt` | `commonMain` |
| `library/LibraryScreen.kt` | `commonMain` |
| `library/LibraryViewModel.kt` | `androidMain` |

**Key logic:** Drag-to-reorder calls `PATCH /api/subscriptions` with `{ orderedFeedUrls }` on drop (mirrors web pattern). Downloads list reads from `DownloadFeature` state. Quota check happens in `DownloadFeature` before initiating a download.
