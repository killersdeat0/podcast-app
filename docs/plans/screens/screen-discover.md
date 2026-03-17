# Screen: Discover

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
Primary search and discovery surface; accessible to all users including guests.

## Contents
- Search bar (full-text, calls Edge Function on query change)
- Trending section (horizontal scroll of podcast cards)
- Genre filter tabs (All, Comedy, Tech, News, etc.)
- Podcast result grid (lazy, infinite scroll)

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

**Key logic:** `DiscoverFeature` calls `/functions/v1/podcasts-search` with the current query string; debounces input by ~300 ms. Genre tab selection filters results client-side or re-queries with a genre parameter.
