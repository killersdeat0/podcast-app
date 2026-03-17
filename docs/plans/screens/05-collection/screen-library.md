# Screen: Library

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
User's personal podcast collection and downloaded episodes, with drag-to-reorder support.

## Contents
- "Library" screen title
- **"Subscriptions"** section heading
  - Subscription rows: artwork thumbnail · podcast name · unplayed count — six-dot drag handle on the **right** side of each row
- **"Downloads"** section heading (paid users see **"Unlimited"** purple pill beside the heading)
  - Downloaded episode rows:
    - Play icon overlay on artwork
    - Episode title + podcast name
    - Green **"Downloaded ✓"** badge + file size in MB + duration (e.g., "Downloaded • 45 MB • 48m")
    - Three-dot menu on the right
- **Guest empty state:** cloud-off icon · "Sign in to save podcasts" heading · "Subscribe to your favorite podcasts to sync them across your devices." subtitle · "Sign In" button (navigates to Login screen)
- **Logged-in empty state** (no subscriptions yet): prompt to browse Discover
- Mini player bar (persistent, above tab bar)

## Navigation
- **Arrives from:** Bottom tab bar (Library tab)
- **Goes to:** Podcast Detail (tap any podcast) · Login screen (guest "Sign In" button) · Upgrade Sheet (4th download/day — free tier)

## Feature Gates
| Element | Free | Paid |
|---------|------|------|
| View subscriptions | ✓ | ✓ |
| Downloads | 3/day | Unlimited |
| Downloads section badge | — | "Unlimited" purple pill |
| Exceeding download quota | Upgrade Sheet | — |
| Delete download | Three-dot menu | Three-dot menu |

## Implementation

| File | Source Set |
|------|------------|
| `library/LibraryFeature.kt` | `commonMain` |
| `library/LibraryScreen.kt` | `commonMain` |
| `library/LibraryViewModel.kt` | `androidMain` |

**Key logic:** Drag-to-reorder calls `PATCH /api/subscriptions` with `{ orderedFeedUrls }` on drop (mirrors web pattern). Downloads list reads from `DownloadFeature` state. Quota check happens in `DownloadFeature` before initiating a download.
