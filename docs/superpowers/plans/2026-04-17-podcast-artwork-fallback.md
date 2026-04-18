# PodcastArtwork Fallback Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared `PodcastArtwork` component that shows a muted colored letter tile when artwork is missing or fails to load, and replace every raw `<img>` artwork tag across the web app with it.

**Architecture:** A single new client component at `web/src/components/ui/PodcastArtwork.tsx` owns all fallback logic (error state, hash-to-color, letter extraction). Callers pass `src`, `title`, and `className` — the component handles the rest. All existing ternary `artwork_url ? <img> : <div>` patterns and inline `onError` handlers across the app are replaced with one call.

**Tech Stack:** React (useState), TypeScript, Tailwind CSS v4 (arbitrary property syntax), Vitest + Testing Library

---

## File Map

| Action | File | Change |
|---|---|---|
| **Create** | `web/src/components/ui/PodcastArtwork.tsx` | New component |
| **Create** | `web/src/components/ui/PodcastArtwork.test.tsx` | Unit tests |
| **Modify** | `web/src/components/player/Player.tsx` | Replace img + remove `artworkError` state |
| **Modify** | `web/src/app/(app)/podcast/[id]/page.tsx` | Replace img + remove inline `onError` |
| **Modify** | `web/src/components/ui/Sidebar.tsx` | Replace img |
| **Modify** | `web/src/app/(app)/queue/page.tsx` | Replace ×2 |
| **Modify** | `web/src/app/(app)/history/page.tsx` | Replace ternary pattern |
| **Modify** | `web/src/app/(app)/playlist/[id]/page.tsx` | Replace ternary pattern |
| **Modify** | `web/src/app/(app)/bookmarks/page.tsx` | Replace ternary pattern |
| **Modify** | `web/src/components/podcasts/PodcastCard.tsx` | Replace img |
| **Modify** | `web/src/app/(app)/discover/page.tsx` | Replace ×4 |
| **Modify** | `web/src/app/(app)/profile/page.tsx` | Replace ternary pattern |

---

## Task 1: Create PodcastArtwork component + tests

**Files:**
- Create: `web/src/components/ui/PodcastArtwork.tsx`
- Create: `web/src/components/ui/PodcastArtwork.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/ui/PodcastArtwork.test.tsx`:

```tsx
import '@testing-library/jest-dom'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PodcastArtwork } from './PodcastArtwork'

describe('PodcastArtwork', () => {
  it('renders an img when src is provided', () => {
    render(<PodcastArtwork src="https://example.com/art.jpg" title="My Podcast" className="w-10 h-10" />)
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/art.jpg')
  })

  it('renders letter tile immediately when src is null', () => {
    render(<PodcastArtwork src={null} title="My Podcast" className="w-10 h-10" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('renders letter tile immediately when src is empty string', () => {
    render(<PodcastArtwork src="" title="Syntax" className="w-10 h-10" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('renders letter tile immediately when src is undefined', () => {
    render(<PodcastArtwork title="Hello World" className="w-10 h-10" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('H')).toBeInTheDocument()
  })

  it('swaps to letter tile when img fires onError', () => {
    render(<PodcastArtwork src="https://broken.com/art.jpg" title="Bad Podcast" className="w-10 h-10" />)
    const img = screen.getByRole('img')
    fireEvent.error(img)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('uses ? when title is null', () => {
    render(<PodcastArtwork src={null} title={null} className="w-10 h-10" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('uses ? when title is empty string', () => {
    render(<PodcastArtwork src={null} title="" className="w-10 h-10" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('same title always produces the same background color', () => {
    const { container: c1 } = render(<PodcastArtwork src={null} title="Consistent Show" className="w-10 h-10" />)
    const { container: c2 } = render(<PodcastArtwork src={null} title="Consistent Show" className="w-10 h-10" />)
    const color1 = (c1.firstChild as HTMLElement).style.backgroundColor
    const color2 = (c2.firstChild as HTMLElement).style.backgroundColor
    expect(color1).toBe(color2)
    expect(color1).not.toBe('')
  })

  it('different titles produce different background colors', () => {
    const { container: c1 } = render(<PodcastArtwork src={null} title="Alpha Show" className="w-10 h-10" />)
    const { container: c2 } = render(<PodcastArtwork src={null} title="Zeta Show" className="w-10 h-10" />)
    const color1 = (c1.firstChild as HTMLElement).style.backgroundColor
    const color2 = (c2.firstChild as HTMLElement).style.backgroundColor
    // Not guaranteed to differ (hash collision possible with 8 colors), but these two do
    expect(color1).not.toBe(color2)
  })

  it('applies className to the letter tile div', () => {
    const { container } = render(<PodcastArtwork src={null} title="Test" className="w-10 h-10 rounded-lg" />)
    expect(container.firstChild).toHaveClass('w-10', 'h-10', 'rounded-lg')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd web && npm test -- --run PodcastArtwork.test
```

Expected: multiple failures — `PodcastArtwork` not found.

- [ ] **Step 3: Implement the component**

Create `web/src/components/ui/PodcastArtwork.tsx`:

```tsx
'use client'

import { useState } from 'react'

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

function simpleHash(str: string): number {
  let h = 0
  for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

interface PodcastArtworkProps {
  src?: string | null
  title?: string | null
  className?: string
}

export function PodcastArtwork({ src, title, className }: PodcastArtworkProps) {
  const [imgError, setImgError] = useState(false)

  const letter = title?.trim()[0]?.toUpperCase() ?? '?'
  const color = MUTED_COLORS[simpleHash(title ?? '') % MUTED_COLORS.length]

  if (!src || imgError) {
    return (
      <div
        className={`${className ?? ''} flex items-center justify-center select-none [container-type:size]`}
        style={{ backgroundColor: color }}
      >
        <span className="font-bold text-white text-[45cqmin] leading-none">
          {letter}
        </span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setImgError(true)}
    />
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd web && npm test -- --run PodcastArtwork.test
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/components/ui/PodcastArtwork.tsx src/components/ui/PodcastArtwork.test.tsx
git commit -m "feat: add PodcastArtwork component with muted letter-tile fallback"
```

---

## Task 2: Replace artwork in Player.tsx

**Files:**
- Modify: `web/src/components/player/Player.tsx`

Player currently has `artworkError` state (line 81), resets it on episode change (line 208), and uses it to conditionally show/hide the img (line 724). All of this is replaced by `PodcastArtwork`.

- [ ] **Step 1: Add import**

At the top of `Player.tsx`, add:
```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

- [ ] **Step 2: Remove `artworkError` state and its reset**

Remove line 81:
```tsx
const [artworkError, setArtworkError] = useState(false)
```

Remove line 208 (inside the effect that runs on `nowPlaying` change):
```tsx
setArtworkError(false)
```

- [ ] **Step 3: Replace the img block**

Find (lines 724–734):
```tsx
{nowPlaying.artworkUrl && !artworkError && (
  <Link href={`/podcast/${encodeURIComponent(nowPlaying.feedUrl)}`} className="flex-shrink-0">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={nowPlaying.artworkUrl}
      alt=""
      className="w-10 h-10 md:w-12 md:h-12 rounded-lg object-cover hover:opacity-80 transition-opacity"
      onError={() => setArtworkError(true)}
    />
  </Link>
)}
```

Replace with:
```tsx
<Link href={`/podcast/${encodeURIComponent(nowPlaying.feedUrl)}`} className="flex-shrink-0">
  <PodcastArtwork
    src={nowPlaying.artworkUrl}
    title={nowPlaying.podcastTitle}
    className="w-10 h-10 md:w-12 md:h-12 rounded-lg object-cover hover:opacity-80 transition-opacity"
  />
</Link>
```

Note: the wrapping `{nowPlaying.artworkUrl && !artworkError && (...)}` guard is removed — `PodcastArtwork` always renders (showing the letter tile when src is absent).

- [ ] **Step 4: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/components/player/Player.tsx
git commit -m "refactor: replace Player artwork img with PodcastArtwork component"
```

---

## Task 3: Replace artwork in podcast/[id]/page.tsx

**Files:**
- Modify: `web/src/app/(app)/podcast/[id]/page.tsx`

This file has the inline `onError` fallback we added recently (lines 885–898). Replace it with `PodcastArtwork`.

- [ ] **Step 1: Add import**

```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

- [ ] **Step 2: Replace the img block**

Find (lines 885–898):
```tsx
{artwork && (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={artwork}
    alt={title}
    className="w-32 h-32 md:w-40 md:h-40 rounded-2xl object-cover flex-shrink-0 shadow-2xl ring-1 ring-outline-variant self-start"
    onError={(e) => {
      const fallback = feed?.artworkUrl
      if (fallback && fallback !== artwork) {
        setArtwork(fallback)
      } else {
        e.currentTarget.style.display = 'none'
      }
    }}
  />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={artwork}
  title={title}
  className="w-32 h-32 md:w-40 md:h-40 rounded-2xl object-cover flex-shrink-0 shadow-2xl ring-1 ring-outline-variant self-start"
/>
```

Note: the `{artwork && (...)}` guard is removed — `PodcastArtwork` renders the letter tile when `artwork` is empty. The inline `onError` RSS fallback logic is also removed since the component handles the fallback via letter tile.

- [ ] **Step 3: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd web && git add "src/app/(app)/podcast/[id]/page.tsx"
git commit -m "refactor: replace podcast hero img with PodcastArtwork component"
```

---

## Task 4: Replace artwork in Sidebar.tsx

**Files:**
- Modify: `web/src/components/ui/Sidebar.tsx`

- [ ] **Step 1: Add import**

```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

- [ ] **Step 2: Replace the img**

Find (line ~83–85):
```tsx
{sub.artwork_url ? (
  <img src={sub.artwork_url} alt="" className="w-6 h-6 rounded-md object-cover" />
) : (
  <div className="w-6 h-6 rounded-md bg-surface-container-high" />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={sub.artwork_url}
  title={sub.title}
  className="w-6 h-6 rounded-md object-cover"
/>
```

- [ ] **Step 3: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd web && git add src/components/ui/Sidebar.tsx
git commit -m "refactor: replace Sidebar artwork img with PodcastArtwork component"
```

---

## Task 5: Replace artwork in queue/page.tsx (×2)

**Files:**
- Modify: `web/src/app/(app)/queue/page.tsx`

There are two separate artwork spots: server-side queue items (line ~115) and client-side queue items (line ~338).

- [ ] **Step 1: Add import**

```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

- [ ] **Step 2: Replace first spot (server queue items, ~line 115)**

Find:
```tsx
{item.episode?.artwork_url ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={item.episode.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
) : (
  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex-shrink-0" />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={item.episode?.artwork_url}
  title={item.episode?.podcast_title}
  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
/>
```

- [ ] **Step 3: Replace second spot (client queue items, ~line 338)**

Find:
```tsx
{ep.artworkUrl ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={ep.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
) : (
  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex-shrink-0" />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={ep.artworkUrl}
  title={ep.podcastTitle}
  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
/>
```

- [ ] **Step 4: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd web && git add "src/app/(app)/queue/page.tsx"
git commit -m "refactor: replace queue artwork imgs with PodcastArtwork component"
```

---

## Task 6: Replace artwork in history, playlist, and bookmarks

**Files:**
- Modify: `web/src/app/(app)/history/page.tsx`
- Modify: `web/src/app/(app)/playlist/[id]/page.tsx`
- Modify: `web/src/app/(app)/bookmarks/page.tsx`

All three follow the same ternary pattern.

- [ ] **Step 1: history/page.tsx — add import and replace**

Add import:
```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

Find (~line 258):
```tsx
{item.episode?.artwork_url ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={item.episode.artwork_url}
    alt=""
    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
  />
) : (
  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex-shrink-0" />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={item.episode?.artwork_url}
  title={item.episode?.podcast_title}
  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
/>
```

- [ ] **Step 2: playlist/[id]/page.tsx — add import and replace**

Add import:
```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

Find (~line 198):
```tsx
{item.episode?.artwork_url ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={item.episode.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
) : (
  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex-shrink-0" />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={item.episode?.artwork_url}
  title={item.episode?.podcast_title}
  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
/>
```

- [ ] **Step 3: bookmarks/page.tsx — add import and replace**

Add import:
```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

Find (~line 113):
```tsx
{group.episode?.artworkUrl && (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={group.episode.artworkUrl}
    alt=""
    width={44}
    height={44}
    className="rounded-lg flex-shrink-0 object-cover"
  />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={group.episode?.artworkUrl}
  title={group.episode?.podcastTitle}
  className="w-11 h-11 rounded-lg flex-shrink-0 object-cover"
/>
```

Note: `width={44}` and `height={44}` (44px = `w-11 h-11`) become Tailwind classes on `PodcastArtwork`.

- [ ] **Step 4: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd web && git add "src/app/(app)/history/page.tsx" "src/app/(app)/playlist/[id]/page.tsx" "src/app/(app)/bookmarks/page.tsx"
git commit -m "refactor: replace artwork imgs in history, playlist, bookmarks with PodcastArtwork"
```

---

## Task 7: Replace artwork in PodcastCard.tsx

**Files:**
- Modify: `web/src/components/podcasts/PodcastCard.tsx`

- [ ] **Step 1: Add import and replace**

Add import:
```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

Find (~line 12):
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={podcast.artworkUrl600}
  alt={podcast.collectionName}
  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
/>
```

Replace with:
```tsx
<PodcastArtwork
  src={podcast.artworkUrl600}
  title={podcast.collectionName}
  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
/>
```

- [ ] **Step 2: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
cd web && git add src/components/podcasts/PodcastCard.tsx
git commit -m "refactor: replace PodcastCard artwork img with PodcastArtwork component"
```

---

## Task 8: Replace artwork in discover/page.tsx (×4)

**Files:**
- Modify: `web/src/app/(app)/discover/page.tsx`

Four spots: episode card (~line 54), horizontal podcast link (~line 96), search preview (~line 279), search dropdown result (~line 601), featured podcast (~line 672).

- [ ] **Step 1: Add import**

```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

- [ ] **Step 2: Replace episode card (~line 54)**

Find:
```tsx
{ep?.artwork_url ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={ep.artwork_url}
    alt={ep.title}
    className="w-36 h-36 rounded-xl object-cover"
  />
) : (
  <div className="w-36 h-36 rounded-xl bg-surface-container-high" />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={ep?.artwork_url}
  title={ep?.podcast_title ?? ep?.title}
  className="w-36 h-36 rounded-xl object-cover"
/>
```

- [ ] **Step 3: Replace horizontal podcast link (~line 96)**

Find:
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={podcast.artworkUrl600}
  alt={podcast.collectionName}
  className="w-36 h-36 rounded-xl object-cover"
/>
```

Replace with:
```tsx
<PodcastArtwork
  src={podcast.artworkUrl600}
  title={podcast.collectionName}
  className="w-36 h-36 rounded-xl object-cover"
/>
```

- [ ] **Step 4: Replace search preview (~line 279)**

Find:
```tsx
{preview.artworkUrl ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={preview.artworkUrl}
    alt={preview.title}
    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
  />
) : (
  <div className="w-14 h-14 rounded-lg bg-surface-container-high flex-shrink-0" />
)}
```

Replace with:
```tsx
<PodcastArtwork
  src={preview.artworkUrl}
  title={preview.title}
  className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
/>
```

- [ ] **Step 5: Replace search dropdown result (~line 601)**

Find:
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={podcast.artworkUrl600}
  alt={podcast.collectionName}
  className="w-10 h-10 rounded-md object-cover flex-shrink-0"
/>
```

Replace with:
```tsx
<PodcastArtwork
  src={podcast.artworkUrl600}
  title={podcast.collectionName}
  className="w-10 h-10 rounded-md object-cover flex-shrink-0"
/>
```

- [ ] **Step 6: Replace featured podcast (~line 672)**

Find:
```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={featuredPodcast.artworkUrl600}
  alt={featuredPodcast.collectionName}
  className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
/>
```

Replace with:
```tsx
<PodcastArtwork
  src={featuredPodcast.artworkUrl600}
  title={featuredPodcast.collectionName}
  className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
/>
```

- [ ] **Step 7: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
cd web && git add "src/app/(app)/discover/page.tsx"
git commit -m "refactor: replace discover page artwork imgs with PodcastArtwork component"
```

---

## Task 9: Replace artwork in profile/page.tsx

**Files:**
- Modify: `web/src/app/(app)/profile/page.tsx`

- [ ] **Step 1: Add import and replace**

Add import:
```tsx
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'
```

Find (~line 370):
```tsx
<div className="relative w-10 h-10 flex-shrink-0">
  {sub.artwork_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sub.artwork_url}
      alt=""
      className="w-10 h-10 rounded-lg object-cover"
    />
  ) : (
    <div className="w-10 h-10 rounded-lg bg-surface-container" />
  )}
  {sub.new_episode_count > 0 && (
```

Replace with:
```tsx
<div className="relative w-10 h-10 flex-shrink-0">
  <PodcastArtwork
    src={sub.artwork_url}
    title={sub.title}
    className="w-10 h-10 rounded-lg object-cover"
  />
  {sub.new_episode_count > 0 && (
```

- [ ] **Step 2: Build check**

```bash
cd web && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
cd web && git add "src/app/(app)/profile/page.tsx"
git commit -m "refactor: replace profile artwork img with PodcastArtwork component"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all unit tests**

```bash
cd web && npm test -- --run
```

Expected: all pass.

- [ ] **Step 2: Full build**

```bash
cd web && npm run build
```

Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Start dev server (`npm run dev`). Verify:
1. Sidebar — break a subscription's `artwork_url` in devtools network tab (block the request) → should show letter tile with muted color
2. Player bar — same: should show letter tile when artwork errors
3. Discover page — search for a podcast → cards show real artwork
4. Podcast detail page `/podcast/201671138` (This American Life, broken artwork) → shows letter tile instead of broken image icon

- [ ] **Step 4: Update web/CLAUDE.md**

Add a note under the component conventions in `web/CLAUDE.md`:

> **Podcast artwork:** Always use `<PodcastArtwork src={...} title={...} className="..." />` from `@/components/ui/PodcastArtwork` instead of raw `<img>` for podcast/episode artwork. It handles missing src and load errors with a muted colored letter tile.

- [ ] **Step 5: Final commit**

```bash
cd web && git add CLAUDE.md  # (or web/CLAUDE.md from repo root)
git commit -m "docs: document PodcastArtwork component in web/CLAUDE.md"
```
