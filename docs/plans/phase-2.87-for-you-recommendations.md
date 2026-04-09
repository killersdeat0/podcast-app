# Phase 2.87 — "For You" Personalized Recommendations

## Problem

The discover page shows only trending podcasts (global, genre-filtered). Logged-in users with subscriptions have no personalized discovery surface — the same trending list is shown to everyone.

## Goal

Add a "For You" section to the discover page that surfaces podcast recommendations tailored to each user's subscriptions. Hidden for guests and users with no subscriptions. Also improve the existing similar podcasts section on the podcast detail page.

---

## Algorithms Considered

### Option 1: Genre Affinity Profile
Fetch iTunes genre metadata for all subscribed podcasts, tally genre frequency across the library, then search iTunes by the user's top genres.

- **Pro:** True cross-subscription personalization; reuses existing 24h-cached iTunes genre lookups
- **Con:** iTunes genre taxonomy is coarse (~20 top-level genres), can surface obvious blockbusters the user already knows

### Option 2: Collaborative Filtering
Build a co-subscription matrix from all users in the DB. Score candidate podcasts by how often they co-appear with the user's subscriptions.

- **Pro:** Discovers non-obvious gems; improves naturally as user base grows
- **Con:** Cold-start problem for new users; requires a background job or materialized view; needs sufficient user overlap to produce meaningful signal — **deferred**

### Option 3: Seeded Multi-Show Similar
Run the existing `/api/podcasts/similar` logic against 3–5 of the user's most recently visited shows in parallel, then merge and deduplicate.

- **Pro:** No new algorithm — pure orchestration of existing logic; ships fast
- **Con:** Less personalized than a true genre profile; seeds can produce overlapping results

---

## Decision: Pure Genre Affinity (Option 1)

Name-based seeding (Option 3) was initially combined but dropped — it produced name-pollution results (e.g. searching "Personality Hires" surfaced many unrelated "Lemonade Stand" podcasts due to word overlap). Genre-only is the right signal for a "For You" feed.

Collaborative filtering (Option 2) deferred until user base is large enough.

---

## What's Done ✓

### `web/src/lib/podcasts/itunesHelpers.ts` ✓
Shared iTunes utilities used by `recommendations/route.ts`:
- `cleanTerm(title)` — strip stop words
- `fetchGenreIds(collectionId)` — iTunes lookup, cached 24h, filters IDs < 1300, caps at 6 genres
- `searchItunes(params)` — single iTunes search call, cached 24h
- `deduplicateById(results)`
- `filterSubscribed(results, subscribedFeedUrls)`

Note: `similar/route.ts` keeps its logic inline (helpers were not backported there).

### `web/src/app/api/podcasts/recommendations/route.ts` ✓
- Auth-required GET, `force-dynamic` (no route cache)
- Fetches subscriptions + `listening_by_show` in parallel from Supabase
- Seeds: top 2 by `seconds_listened` (pinned) + 3 random from the rest
- Genre lookup for seeds with `collection_id` (cached 24h)
- Searches top 5 genres with `term=podcast&genreId=X&limit=50` (genre-only, no name bias)
- Shuffles results before dedup so order varies per visit
- Returns up to 36 results; excludes subscribed shows
- Dev debug panel: seeds, listen seconds, pinned flag, genre frequency, filtering breakdown

### `web/src/app/(app)/discover/page.tsx` ✓
- "For You" section below trending grid (avoids layout shift)
- 300ms delayed skeleton (matches Continue Listening pattern)
- `section-fade-in` CSS animation on mount
- Horizontal scroll layout matching Continue Listening (`ForYouCard` at `w-36`)
- Gated on `!isGuest && (showForYouSkeleton || forYouPodcasts.length > 0)`

### `web/src/app/globals.css` ✓
- `@keyframes fade-slide-in` + `.section-fade-in` class

### Locale files ✓
- `forYouTitle`: "✨ For You" / "✨ Para ti"
- `forYouSubtitle`: "Based on your subscriptions" / "Basado en tus suscripciones"

---

## Completed Improvements ✓

**A1. Weighted genre search counts** ✓ — limits proportional to genre frequency; `Math.max(20, Math.min(80, Math.round(50 * freq / totalFreq)))`

**A2. Serendipity genre slot** ✓ — 1 random genre outside top 5, limit=20

**A3. Episode count quality filter** ✓ — `trackCount < 5` filtered from recommendations

**B1. Same-network/producer search pass** ✓ — `fetchArtistName` fetches from same cached iTunes lookup; `cleanedArtist` searched with and without genre IDs; capped at 10 network results

**B2. Genre cap 3 → 6** ✓ — both `itunesHelpers.ts` and inline `similar/route.ts` use `.slice(0, 6)`

**B3. Episode count quality filter** ✓ — `afterQualityFilter` step in `similar/route.ts`

**Cache clear on sign-out** ✓ — `useSignOut` hook (`web/src/lib/auth/useSignOut.ts`) owns all sign-out cleanup via `USER_SCOPED_CACHE_KEYS`; used by both Sidebar and Settings page. `for-you-cache` is in that list.

---

## Mobile

The mobile app (Compose Multiplatform) uses Supabase Edge Functions directly — it does not call Next.js API routes. The following work is needed before parity:

1. **New Edge Function: `podcasts-recommendations`** — equivalent of `web/src/app/api/podcasts/recommendations/route.ts`. Accepts a Supabase JWT (Authorization header), fetches the user's subscriptions + listening stats from the DB, runs the same genre-affinity algorithm, returns up to 36 `ItunesResult`-shaped objects.

2. **Similar podcasts improvements** — `B1` (same-network search) and `B3` (quality filter) live in the Next.js route only. The mobile equivalent (if any) would need the same logic added.

3. **Caching** — mobile should cache For You results for 2 hours (equivalent of the localStorage layer), keyed per user so switching accounts clears it.

---

## Verification

1. Logged-in user visits `/discover` → "For You" section appears below trending, horizontal scroll, no subscribed shows
2. Expand dev debug panel → seeds show pinned flag, topGenres populated, filtering.remaining > 12
3. Refresh multiple times → different shows surface (shuffle + random seeds working)
4. Guest or 0-subscription user → section absent
5. Podcast detail page → similar section still works, now includes same-network results
6. `npm run build` passes, `npm test -- --run` passes
