# Screen: Podcast Detail

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Full podcast page with artwork hero, follow toggle, and scrollable episode list.

## Contents
- **Clear (non-blurred) artwork photo** displayed prominently at the top
- Three-dot overflow menu (top-right) for additional actions (share, etc.)
- Podcast title with **notification bell icon beside it** (not a separate toggle row)
- Author name
- Horizontal row of **genre/tag chips** below the author name (e.g., "Design", "Arts", "Interviews")
- Multi-line podcast **description text block** with a **"Read more"** expand link
- Two side-by-side action buttons:
  - **"▶ Play Latest"** — primary filled button (purple); plays the most recent episode immediately
  - **"+ Follow" / "Unfollow"** — outline button for subscribe/unsubscribe (label is "Follow", not "Subscribe")
- New-episode dot badge (unplayed count)
- **"Episodes"** section heading with sort and filter controls (top-right of section):
  - **Sort toggle** — "Newest ↓" / "Oldest ↑"; persisted to local storage keyed by feedUrl (`podcast-sort-{feedUrl}`)
  - **"Unfinished" filter** — toggles to show only episodes that haven't been completed; highlighted when active; persisted as `podcast-filter-{feedUrl}` = `'unfinished'`
- Episode filter pill (paid — notification filter, separate from the sort/unfinished display filter)
- Episode rows:
  - Episode title (bold)
  - Description snippet (2 lines)
  - Date · Duration (small, muted)
  - Right-side action icons: **share icon**, **download icon** (shows checkmark when downloaded), **play button** (circle)
  - Progress bar below the row (shown on in-progress episodes)

## Navigation
- **Arrives from:** Discover (search result) · Library (subscription list)
- **Goes to:** Full Player (tap episode play button) · Notification Settings (tap bell icon) · Upgrade Sheet (free: episode filter) · Login Prompt Sheet (guest: follow)

## Feature Gates
| Element | Free | Paid | Guest |
|---------|------|------|-------|
| Browse episodes | ✓ | ✓ | ✓ |
| Follow / Unfollow | ✓ | ✓ | Login Prompt Sheet |
| Play Latest | ✓ | ✓ | ✓ |
| Episode filter | — | ✓ | — |
| Download | 3/day | Unlimited | — |

## Implementation

| File | Source Set |
|------|------------|
| `podcastdetail/PodcastDetailFeature.kt` | `commonMain` |
| `podcastdetail/PodcastDetailScreen.kt` | `commonMain` |
| `podcastdetail/PodcastDetailViewModel.kt` | `androidMain` |

**Key logic:** Episode list fetched via `/functions/v1/podcasts-feed`. Follow upserts into `subscriptions` table. Artwork uses iTunes CDN URL from `subscriptions.artwork_url` in preference to RSS feed artwork to avoid hotlink blocks.
