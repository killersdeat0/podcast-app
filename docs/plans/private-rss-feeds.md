# Private RSS Feed Support

## Goal

Let users subscribe to private podcast feeds (Patreon, Supercast, etc.) by pasting a private feed URL directly. No schema changes needed — the private URL is stored verbatim in `subscriptions.feed_url` and every subsequent fetch uses it transparently.

## Approach

Token-in-URL only (v1). Private feeds from Patreon, Supercast, and similar services embed a secret token in the URL itself (e.g. `https://feeds.patreon.com/rss/abc123secrettoken`). The Edge Function already does a plain `fetch(feedUrl)` — no auth header changes needed. Storing the URL is all that's required.

Basic Auth (username + password separate from URL) is explicitly out of scope for v1.

## What's already working

- `supabase/functions/podcasts-feed/index.ts` — fetches any URL as-is, no changes needed
- `/api/podcasts/feed` — proxies the URL to the Edge Function, no changes needed
- `/api/subscriptions/refresh` — iterates stored `feed_url` values, works automatically
- Podcast detail page — calls `/api/podcasts/feed?url=<feedUrl>`, works automatically

The only missing piece is a **subscribe-by-URL flow** in the UI. Right now discovery is iTunes-only, which never surfaces private feeds.

## Plan

### Step 1 — Subscribe by URL UI

Add a "Add by URL" flow accessible from the Discover page (and/or sidebar). The user pastes a feed URL, the app fetches a preview (title + artwork), they confirm, and subscribe.

**UI placement:** A secondary CTA on the Discover page — e.g. a small "Have a private feed? Add by URL →" link that expands an input field. Keep it low-profile so it doesn't clutter the main discovery experience.

**Flow:**
1. User pastes URL into input and hits enter / clicks "Fetch"
2. Client calls `GET /api/podcasts/feed?url=<url>&limit=1` to preview the feed
3. If successful: show a small preview card (title + artwork) with a "Subscribe" button
4. On confirm: call `POST /api/subscriptions` with `{ feedUrl, title, artworkUrl }` — same as the existing subscribe button on the podcast detail page
5. Fire `subscriptions-changed` event to sync the sidebar
6. Toast confirmation, input clears

**Error states:**
- Feed fetch fails (404, timeout, malformed XML) → "Couldn't load that feed. Check the URL and try again."
- Already subscribed → "You're already subscribed to this podcast."
- Feed limit reached → existing freemium limit message

### Step 2 — Stale/expired token error handling

When a private feed URL returns a non-200 (401, 403, 404, or network error), the podcast detail page currently shows an empty episode list with no explanation.

**Changes needed:**

- `/api/podcasts/feed` — on non-200 from the Edge Function, return a structured error response including the upstream status: `{ error: 'feed_unavailable', upstreamStatus: 401 }`. Currently returns a generic 502 with no status detail.
- Podcast detail page — currently throws on any non-ok response without reading the body. Change to always read JSON, then detect `error: 'feed_unavailable'` with `upstreamStatus` 401/403 and show an inline warning:
  > "This feed couldn't be loaded. If this is a private feed, your access link may have expired — check your Patreon or provider account for an updated URL."
  - Include an "Unsubscribe" button so they can cleanly remove the broken subscription
  - Do not show a blank episode list — that's confusing

**Edge cases:**
- Transient network errors: distinguish between a likely-expired token (401/403) and a temporary outage (500, timeout) — show slightly different messaging ("feed temporarily unavailable" vs "your access may have expired")
- The refresh job (`/api/subscriptions/refresh`) should gracefully skip feeds that return 401/403 rather than crashing the batch — already likely handled by try/catch but worth verifying

### Step 3 — Docs and plan updates

- Update `docs/api.md` with the new error shape from `/api/podcasts/feed`
- Update `CLAUDE.md` if any new patterns are introduced
- Mark this feature shipped in `community-feature-requests.md`

## Out of scope (v1)

- Basic Auth (username + password) — only needed for self-hosted feeds, rare
- "Edit feed URL" after subscribing — unsubscribe + re-subscribe is acceptable for token rotation
- Token expiry detection / proactive re-prompt — passive error on next visit is sufficient
- Mobile — mobile fetches RSS via the same Edge Function, so private URLs will work there automatically once the web subscribe-by-URL flow exists

## Files to touch

| File | Change |
|------|--------|
| `web/src/app/(app)/discover/page.tsx` | Add "Add by URL" input + preview card |
| `web/src/app/api/podcasts/feed/route.ts` | Return structured error on non-200 upstream |
| `web/src/app/(app)/podcast/[id]/page.tsx` | Handle `feed_unavailable` error state |
| `web/src/lib/i18n/locales/en.ts` + `es.ts` | New strings for URL input, error states |
| `docs/api.md` | Document new error shape |
| `docs/plans/community-feature-requests.md` | Mark shipped when done |
