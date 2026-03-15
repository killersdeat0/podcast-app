# Phase 2.5 — Feed Refresh & New Episode Cache

## Goal

Build a periodic feed-checking mechanism so new episode badges stay accurate without the user manually visiting each podcast's detail page. Lays the shared caching foundation for Phase 3 mobile push notifications.

---

## Status

**Complete.** All web-side work is shipped. The remaining Phase 3 item is the Supabase Edge Function cron — see Mobile Handoff below.

### Completed

| Item | File(s) |
|---|---|
| `last_visited_at`, `latest_episode_pub_date`, `episode_filter` columns | `supabase/migrations/20260314000000_subscription_visit_tracking.sql` |
| `new_episode_count` column | `supabase/migrations/20260314000001_subscription_episode_count.sql` |
| `last_feed_checked_at` column | `supabase/migrations/20260315000000_subscription_feed_cache.sql` |
| `PATCH /api/subscriptions` Body B — visit tracking + episode cache upsert | `src/app/api/subscriptions/route.ts` |
| `POST /api/subscriptions/refresh` — background feed refresh endpoint | `src/app/api/subscriptions/refresh/route.ts` |
| `GET /api/podcasts/unseen` — aged-out episode cache lookup | `src/app/api/podcasts/unseen/route.ts` |
| Podcast detail page — on-mount count update, on-unmount reset, episode filter UI, nav warning, eager badge clear on leave | `src/app/(app)/podcast/[id]/page.tsx` |
| Sidebar — badge rendering + `maybeRefresh()` on mount + hourly `setInterval` | `src/components/ui/Sidebar.tsx` |
| Episode dedup + merge utility (new episodes) | `src/lib/subscriptions/mergeNewEpisodes.ts` |
| Episode search merge utility (RSS + iTunes, dedup by guid) | `src/lib/episodes/mergeEpisodeSources.ts` |
| Dev: reset all `last_visited_at` to 7 days ago (profile page button) | `src/app/api/dev/reset-last-visited/route.ts` |
| Docs: `data-model.md`, `api.md` updated | — |

### Remaining (Phase 3)

| Item | Notes |
|---|---|
| Supabase Edge Function cron | Runs hourly server-side for all users; required for mobile badge freshness without BackgroundFetch. See Mobile Handoff below. |

---

## Problem

Currently `new_episode_count` and `latest_episode_pub_date` only update when the user opens a specific podcast's detail page. Sidebar badges are stale until then — defeating the purpose of a badge system.

Phase 3 (mobile) needs push notifications for new episodes, which requires server-side knowledge of new episodes on a schedule — independent of user interaction.

---

## Requirements

### Functional

1. **Periodic feed check** — the app must check all subscriptions for new episodes without requiring the user to visit each podcast page
2. **Staleness threshold** — feeds must not be re-checked more than once per hour per subscription (podcast RSS rarely updates more frequently; unnecessary fetches waste resources and hit rate limits)
3. **Badge accuracy** — after a refresh, sidebar and profile badges must reflect real new episode counts
4. **Episode filter respected** — paid users' `episode_filter` is applied when computing `new_episode_count` during refresh (same logic as the detail page)
5. **Mobile-compatible data model** — the cache layer must work for both the web client-triggered flow (Phase 2.5) and a future Supabase cron / mobile background job (Phase 3) without schema changes

### Non-functional

6. **Non-blocking** — refresh runs in the background after the app shell renders; must not delay initial page load
7. **Idempotent** — running refresh multiple times within the staleness window is a no-op (server-side gate, not only client-side)
8. **Concurrency-limited** — feeds fetched in parallel but capped at 10 concurrent to avoid overwhelming the server
9. **Tab-safe** — multiple open tabs must not all call refresh simultaneously; a `localStorage` timestamp provides a client-side gate

---

## Schema Changes

**Migration:** `supabase/migrations/20260315000000_subscription_feed_cache.sql`

```sql
alter table public.subscriptions
  add column if not exists last_feed_checked_at timestamptz;
```

(`latest_episode_pub_date`, `last_visited_at`, `episode_filter`, `new_episode_count` already exist.)

---

## API: `POST /api/subscriptions/refresh`

**Auth:** Required (session cookie). No request body.

**Logic:**
1. Fetch all subscriptions for the user + user tier from `user_profiles`
2. Filter to subscriptions where `last_feed_checked_at` is null or older than 1 hour
3. For each stale subscription, fetch RSS via the internal `/api/podcasts/feed?url=...` call
4. Compute `latest_episode_pub_date` (newest `pubDate`) and `new_episode_count` (episodes since `last_visited_at`; apply `episode_filter` for paid users; if `last_visited_at` is null, count all)
5. Update `latest_episode_pub_date`, `new_episode_count`, `last_feed_checked_at = now()` for each
6. Return full updated subscription list (same shape as `GET /api/subscriptions`)

Failed individual feeds are silently skipped (don't break the whole refresh). Uses `Promise.allSettled` with a batch size of 10.

**Response:** `{ subscriptions: SubscriptionRow[] }`

---

## Client Changes

### Sidebar

After the initial subscription load, call `maybeRefresh()`:

```typescript
async function maybeRefresh() {
  const lastCalled = Number(localStorage.getItem('feed_refresh_last_called') ?? 0)
  if (Date.now() - lastCalled < 60 * 60 * 1000) return  // skip if < 1 hour ago
  localStorage.setItem('feed_refresh_last_called', String(Date.now()))
  const res = await fetch('/api/subscriptions/refresh', { method: 'POST' })
  if (!res.ok) return
  const { subscriptions } = await res.json()
  setSubscriptions(subscriptions)
}
```

This replaces the local subscription state with fresh counts, which re-renders badges immediately.

---

## Throttle Strategy (Two Layers)

| Layer | Mechanism | Scope |
|---|---|---|
| Client | `localStorage` key `feed_refresh_last_called` | Per browser — prevents multiple tabs calling refresh in the same hour |
| Server | `subscriptions.last_feed_checked_at` | Per subscription in DB — authoritative; skips feeds checked within the last hour regardless of caller |

---

## Mobile Handoff (Phase 3)

`last_feed_checked_at` is the shared cache key. The web sidebar's `maybeRefresh()` only fires when the web app is open — if a user only uses mobile, the DB stays stale until a server-side or mobile-side trigger runs.

### Refresh trigger comparison

| Trigger | Web fresh? | Mobile fresh? | Works when app closed? |
|---|---|---|---|
| Web sidebar only (current) | Yes | No | No |
| Mobile BackgroundFetch calling same endpoint (Option B) | Yes | Yes | Unreliable (iOS throttles) |
| **Supabase Edge Function cron (Option A — preferred)** | **Yes** | **Yes** | **Yes** |

**Option A — Supabase Edge Function cron (preferred):**
- Runs every hour server-side; iterates all subscriptions across all users
- Updates DB directly; both web and mobile read fresh counts on next load
- Enables server-side push notifications via Expo Push API
- Neither platform needs to trigger a refresh — they just read the DB
- The web `maybeRefresh()` becomes a useful fallback for the gap between cron runs

**Option B — Expo BackgroundFetch:**
- Mobile background task calls the same `POST /api/subscriptions/refresh` endpoint
- Triggers local notification if `new_episode_count` increased
- Less reliable on iOS (OS can throttle/defer background tasks)
- Still doesn't update data for web-only users when mobile is closed

Option A is the correct long-term fix — centralised, works even when neither app is running, and serves both platforms from a single source of truth.

---

## Out of Scope for Phase 2.5

- Push notifications (Phase 3 — requires APNs/FCM + Expo Push setup)
- Supabase Edge Function cron (Phase 3 — implement when building mobile)
- Per-subscription configurable refresh interval

---

## Verification

1. Open app → Network tab shows `POST /api/subscriptions/refresh` fires after sidebar loads
2. Reload within 1 hour → refresh is NOT called (localStorage gate)
3. Set `last_feed_checked_at = null` in DB on a subscription → refresh re-checks that feed on next load
4. Paid user with `episode_filter`: confirm count is filtered; free user: confirm it is not
5. Open 3 tabs simultaneously → only 1 refresh call fires
6. Simulate 50 subscriptions: confirm no more than 10 concurrent RSS fetches in flight
