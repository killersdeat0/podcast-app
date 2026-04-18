# PodcastArtwork Fallback Component — Design Spec

**Date:** 2026-04-17

## Problem

Podcast artwork images break silently. A missing or 404'd `src` leaves a broken image icon or blank space with no recovery. This affects every context where artwork appears: player bar, podcast detail hero, sidebar, queue, history, playlists, bookmarks, discover cards.

## Solution

A shared `PodcastArtwork` component that renders artwork when available and falls back to a colored letter tile when not. The letter is the first character of the podcast/show name; the background color is deterministically derived from the name so each podcast gets a consistent color everywhere it appears.

## Component

**Location:** `web/src/components/ui/PodcastArtwork.tsx`

**Props:**
```tsx
interface PodcastArtworkProps {
  src?: string | null
  title?: string | null
  className?: string   // caller controls size, shape (border-radius), and any extra styles
}
```

**Behavior:**
- If `src` is falsy → render letter tile immediately (no `<img>` attempt)
- If `src` is present → render `<img>`; on `onError` → swap to letter tile
- Letter = `title[0].toUpperCase()`, fallback `?` if title is empty/null
- Background color = `MUTED_COLORS[simpleHash(title) % MUTED_COLORS.length]`
- The component renders a single `<div>` or `<img>` that fills the box defined by `className`; no internal sizing

**Color palette (8 muted tones, Option C):**
```ts
const MUTED_COLORS = [
  '#6d5a8a', // muted violet
  '#3d7a8a', // muted teal-blue
  '#4a7c59', // muted green
  '#8a6a3d', // muted amber
  '#8a3d3d', // muted red
  '#7a3d6d', // muted pink
  '#5a5a8a', // muted indigo
  '#3d6a6a', // muted teal
]
```

**Hash function:**
```ts
function simpleHash(str: string): number {
  let h = 0
  for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return Math.abs(h)
}
```

**Letter tile rendering:** centered letter, white text, `font-weight: 700`, `font-size` scales with the container (use `text-[40%]` relative sizing or `w-full h-full flex items-center justify-center`). Background color applied via inline style.

## Usage Sites

Replace every `<img src={artworkUrl} ...>` with `<PodcastArtwork src={artworkUrl} title={name} className="..." />`. The `className` carries the existing Tailwind size/shape classes verbatim.

| File | Current size classes | Title prop |
|---|---|---|
| `components/player/Player.tsx` | `w-10 h-10 md:w-12 md:h-12 rounded-lg` | `nowPlaying.podcastTitle` |
| `app/(app)/podcast/[id]/page.tsx` hero | `w-32 h-32 md:w-40 md:h-40 rounded-2xl` | `title` state |
| `components/ui/Sidebar.tsx` | `w-6 h-6 rounded-md` | `sub.title` |
| `app/(app)/queue/page.tsx` (×2) | `w-10 h-10 rounded-lg` | `item.episode.podcast_title` / `ep.podcastTitle` |
| `app/(app)/history/page.tsx` | `w-10 h-10 rounded-lg` (verify) | `item.episode.podcast_title` |
| `app/(app)/playlist/[id]/page.tsx` | `w-10 h-10 rounded-lg` | `item.episode.podcast_title` |
| `app/(app)/bookmarks/page.tsx` | `w-10 h-10 rounded-lg` (verify) | `group.episode.podcastTitle` |
| `components/podcasts/PodcastCard.tsx` | `w-16 h-16 rounded-lg` | `podcast.collectionName` |
| `app/(app)/discover/page.tsx` (×4) | various | podcast/episode name field at each site |
| `app/(app)/profile/page.tsx` | verify | `sub.title` |

## Implementation Notes

- The `<img>` inside the component needs `{/* eslint-disable-next-line @next/next/no-img-element */}` (same as all current artwork `<img>` tags in the codebase)
- Player.tsx currently has `artworkError` state + `setArtworkError` — these can be removed once the component handles it internally
- `podcast/[id]/page.tsx` has the `onError` fallback we added today — replace with component

## What Changes

- New file: `web/src/components/ui/PodcastArtwork.tsx`
- Existing `onError` logic in `Player.tsx` (hides image) and `podcast/[id]/page.tsx` (our recent fix) is replaced by the component
- No API or data model changes
- No new dependencies

## Out of Scope

- No animation on fallback swap
- No attempt to re-fetch a fresh artwork URL on error (root cause for stale URLs is a separate concern)
- Mobile app is out of scope (separate platform)
