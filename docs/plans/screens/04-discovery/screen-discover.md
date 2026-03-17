# Screen: Discover

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Primary search and discovery surface; accessible to all users including guests.

## Contents
- "Discover" screen title
- Search bar ("Search podcasts, episodes..." placeholder; calls Edge Function on query change)
- Genre filter chips / pills (All, Comedy, Tech, News, True Crime, etc.; horizontally scrollable)
- "Trending" section heading with large podcast artwork cards (2-column grid)
- Podcast result grid below trending (lazy, infinite scroll; appears when search query is active)
- Mini player bar (persistent, above tab bar)

## Navigation
- **Arrives from:** Bottom tab bar (Discover tab) · App Shell after auth/onboarding
- **Goes to:** Podcast Detail (tap any podcast card)

## Feature Gates
| Element | Free | Guest |
|---------|------|-------|
| Search | ✓ | ✓ |
| Browse / trending | ✓ | ✓ |
| Subscribe from result | ✓ | Login Prompt Sheet |

## Implementation

| File | Source Set |
|------|------------|
| `discover/DiscoverFeature.kt` | `commonMain` |
| `discover/DiscoverScreen.kt` | `commonMain` |
| `discover/DiscoverViewModel.kt` | `androidMain` |

**Key logic:** `DiscoverFeature` calls `/functions/v1/podcasts-search` with the current query string; debounces input by ~300 ms. Genre chip selection filters results client-side or re-queries with a genre parameter. Trending section shows on the default (empty query) state; search results replace it when a query is active.
