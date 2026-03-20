# Phase 2.85 — Similar Podcasts + Episode List Caching

## Context

Two improvements to the podcast detail page:
1. **Similar Podcasts** — A "You might also like 🎧" section at the bottom of the podcast page, using iTunes keyword search (existing infrastructure) to surface related content and filtering out the current podcast + already-subscribed podcasts.
2. **Episode list caching** — The RSS feed is re-fetched on every page load. Cache it server-side (Next.js fetch cache, shared across all users) for 1 hour with a manual refresh button next to the "All Episodes" label.

---

## Decisions

| Decision | Choice |
|---|---|
| Similarity signal | iTunes keyword search on podcast title |
| Placement | Below episodes |
| Card count | 6 |
| Guest visibility | Visible (no auth required) |
| Subscription filtering | Client passes loaded feedUrls; API filters server-side |
| Subscription invalidation | Re-fetch on `subscriptions-changed` window event |
| No-results behavior | Hide section entirely |
| iTunes cache TTL | 24 hours |
| Episode list cache | Server-side Next.js fetch cache, shared across users, 1hr TTL |
| Refresh button location | Next to "All Episodes" divider label |
| Section heading | "You might also like 🎧" |

---

## Checklist

### Part 1 — Similar Podcasts

- [ ] **1a. Create `/api/podcasts/similar/route.ts`**
- [ ] **1b. Extract `PodcastCard` to `web/src/components/podcasts/PodcastCard.tsx`**
- [ ] **1c. Update `discover/page.tsx`** to import `PodcastCard` from shared location
- [ ] **1d. Add i18n strings** (`podcast_page.similar_heading`) to `en.ts` and `es.ts`
- [ ] **1e. Update podcast detail page** — add state, `fetchSimilar`, `subscriptions-changed` listener, and UI section

### Part 2 — Episode List Caching + Refresh Button

- [ ] **2a. Update `/api/podcasts/feed/route.ts`** — add `revalidate: 3600` + `nocache` param support
- [ ] **2b. Update podcast detail page** — add `feedRefreshKey` state, `handleRefreshFeed`, and refresh button UI

### Wrap-up

- [ ] **3a. Update `docs/api.md`** — document `/api/podcasts/similar`
- [ ] **3b. Run unit tests** — `cd web && npm test -- --run`

---

## Part 1 — Similar Podcasts

### 1a. New API route: `web/src/app/api/podcasts/similar/route.ts`

No auth required (matches pattern of `/api/podcasts/trending/route.ts`).

**Query params:**
- `term` (required) — podcast title, used as iTunes search keyword
- `excludeId` (optional) — collectionId of the current podcast to exclude
- `excludeFeedUrl` (optional) — feedUrl fallback for exclusion when collectionId is unavailable
- `subscribedFeedUrls` (optional, comma-separated) — feedUrls to filter out

**Logic:**
1. Strip generic words from `term` ("podcast", "the", "show", "official", "weekly", "daily", "episode") to extract meaningful keywords. Fall back to full title if nothing remains.
2. Call iTunes Search API directly with `next: { revalidate: 86400 }` (24hr cache) — do not use `searchPodcasts()` which hardcodes 1hr
3. Filter results:
   - Remove entry where `collectionId == excludeId` (or `feedUrl == excludeFeedUrl` if no collectionId)
   - Remove entries where `feedUrl` is in `subscribedFeedUrls`
   - Remove entries missing `feedUrl`
4. Return first 6 results as `{ results: ItunesResult[] }`

**Reused:**
- `ItunesResult` type — `web/src/lib/itunes/search.ts:1`

---

### 1b. Extract shared `PodcastCard` component

**New file:** `web/src/components/podcasts/PodcastCard.tsx`

Extract the inline `PodcastCard` from `web/src/app/(app)/discover/page.tsx:11–30`. Update discover page to import it. The podcast detail page will also import it.

---

### 1c–1d. i18n strings

**Files:** `web/src/lib/i18n/locales/en.ts` and `es.ts`

Add to the existing locale objects:
```ts
podcast_page: {
  similar_heading: 'You might also like 🎧',
}
```
```ts
// es.ts
podcast_page: {
  similar_heading: 'También te podría gustar 🎧',
}
```

---

### 1e. Podcast detail page changes — Similar Podcasts

**File:** `web/src/app/(app)/podcast/[id]/page.tsx`

**New state:**
```ts
const [similarPodcasts, setSimilarPodcasts] = useState<ItunesResult[]>([])
const [similarLoading, setSimilarLoading] = useState(false)
```

**New fetchSimilar function** (called on mount + on `subscriptions-changed`):
```ts
const fetchSimilar = useCallback(async () => {
  if (!feed) return
  setSimilarLoading(true)
  const params = new URLSearchParams({ term: feed.title })
  if (collectionId) params.set('excludeId', collectionId)
  else params.set('excludeFeedUrl', feedUrl)
  if (subscriptions.length > 0)
    params.set('subscribedFeedUrls', subscriptions.map(s => s.feedUrl).join(','))
  const res = await fetch(`/api/podcasts/similar?${params}`)
  const data = await res.json()
  setSimilarPodcasts(data.results ?? [])
  setSimilarLoading(false)
}, [feed, collectionId, feedUrl, subscriptions])
```

Trigger: `useEffect(() => { fetchSimilar() }, [fetchSimilar])`

Also wire `fetchSimilar` to the `subscriptions-changed` event so the section updates immediately when the user subscribes/unsubscribes.

**UI** — insert before the closing `</div>` at the bottom of the page (after the episodes section):
```tsx
{(similarLoading || similarPodcasts.length > 0) && (
  <div className="mt-8">
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
        {strings.podcast_page.similar_heading}
      </span>
      <div className="flex-1 h-px bg-gray-800/60" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {similarLoading
        ? Array.from({ length: 6 }).map((_, i) => <SkeletonPodcastCard key={i} />)
        : similarPodcasts.map((p) => <PodcastCard key={p.collectionId} podcast={p} />)}
    </div>
  </div>
)}
```

**Reused:**
- `SkeletonPodcastCard` — `web/src/components/ui/Skeleton.tsx`
- Section divider style matches existing "All Episodes" pattern (`podcast/[id]/page.tsx:989–992`)

---

## Part 2 — Episode List Caching + Refresh Button

### 2a. Feed route change: `web/src/app/api/podcasts/feed/route.ts`

**Server-side via Next.js fetch cache** — shared across all users for the same feedUrl. RSS feed content is public and identical for every user; one cached response serves all.

Add `next: { revalidate: 3600 }` to the fetch call. Support a `?nocache=1` param for manual refreshes — when present, use `cache: 'no-store'` instead:

```ts
const nocache = req.nextUrl.searchParams.get('nocache') === '1'

const res = await fetch(
  `${supabaseUrl}/functions/v1/podcasts-feed?url=${encodeURIComponent(feedUrl)}`,
  {
    headers: { Authorization: `Bearer ${supabaseKey}` },
    ...(nocache ? { cache: 'no-store' } : { next: { revalidate: 3600 } }),
  }
)
```

---

### 2b. Podcast detail page changes — Refresh button

**File:** `web/src/app/(app)/podcast/[id]/page.tsx`

Add a `feedRefreshKey` state (integer). The refresh handler increments it; the feed `useEffect` depends on it and appends `&nocache=1` to the fetch URL when triggered by a refresh.

```ts
const [feedRefreshKey, setFeedRefreshKey] = useState(0)
const handleRefreshFeed = () => setFeedRefreshKey(k => k + 1)
```

In the feed `useEffect`:
```ts
const url = feedRefreshKey > 0
  ? `/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}&nocache=1`
  : `/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}`
```

**Refresh button** — inline with the "All Episodes" divider (~line 990):
```tsx
<div className="flex items-center gap-2 mb-1">
  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">All Episodes</span>
  <div className="flex-1 h-px bg-gray-800/60" />
  {totalPages > 1 && <span className="text-xs text-gray-700">{episodePage + 1} / {totalPages}</span>}
  <button
    onClick={handleRefreshFeed}
    disabled={feedLoading}
    title="Refresh episodes"
    className="text-gray-600 hover:text-gray-400 disabled:opacity-30 transition-colors"
  >
    <RefreshCw size={12} className={feedLoading ? 'animate-spin' : ''} />
  </button>
</div>
```

**Icon:** `RefreshCw` from `lucide-react` (already used throughout the app).

---

## Critical files

| File | Action |
|---|---|
| `web/src/app/api/podcasts/similar/route.ts` | CREATE |
| `web/src/components/podcasts/PodcastCard.tsx` | CREATE (extract from discover) |
| `web/src/app/(app)/discover/page.tsx` | Update import |
| `web/src/app/api/podcasts/feed/route.ts` | Add `revalidate: 3600` + `nocache` param support |
| `web/src/app/(app)/podcast/[id]/page.tsx` | Add similar section + refresh button |
| `web/src/lib/i18n/locales/en.ts` | Add `podcast_page.similar_heading` |
| `web/src/lib/i18n/locales/es.ts` | Add Spanish translation |
| `docs/api.md` | Document `/api/podcasts/similar` |

---

## Verification

1. `cd web && npm run dev`
2. Open a podcast page → scroll down → "You might also like 🎧" section loads with 6 cards
3. Cards should not include the current podcast or any already-subscribed podcast
4. Subscribe to one of the similar podcasts → section should refresh and exclude it
5. Reload the page within 1hr → RSS feed served from Next.js cache (server responds faster, no Edge Function call)
6. Click the 🔄 refresh button next to "All Episodes" → sends `?nocache=1`, bypasses cache, re-fetches fresh from RSS
7. `cd web && npm test -- --run`
