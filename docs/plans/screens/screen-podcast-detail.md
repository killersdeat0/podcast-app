# Screen: Podcast Detail

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
Full podcast page with artwork hero, subscribe toggle, and scrollable episode list.

## Contents
- Blurred artwork hero image
- Podcast title and author
- Subscribe / Unsubscribe button
- New-episode dot badge (unplayed count)
- Per-podcast notification toggle → Notification Settings
- Episode filter pill (paid — filter by title pattern)
- Episode rows: artwork thumbnail, title, duration, progress bar
  - Per-row actions: Play, Add to Queue, Download

## Navigation
- **Arrives from:** Discover (search result) · Library (subscription list)
- **Goes to:** Full Player (tap episode play) · Notification Settings (tap notification toggle) · Upgrade Sheet (free: episode filter) · Login Prompt Sheet (guest: subscribe)

## Feature Gates
| Element | Free | Paid | Guest |
|---------|------|------|-------|
| Browse episodes | ✓ | ✓ | ✓ |
| Subscribe | ✓ | ✓ | Login Prompt Sheet |
| Episode filter | — | ✓ | — |
| Download | 3/day | Unlimited | — |

## Implementation

| File | Source Set |
|------|------------|
| `podcastdetail/PodcastDetailFeature.kt` | `commonMain` |
| `podcastdetail/PodcastDetailScreen.kt` | `commonMain` |
| `podcastdetail/PodcastDetailViewModel.kt` | `androidMain` |

**Key logic:** Episode list fetched via `/functions/v1/podcasts-feed`. Subscribe upserts into `subscriptions` table. Artwork uses iTunes CDN URL from `subscriptions.artwork_url` in preference to RSS feed artwork to avoid hotlink blocks.
