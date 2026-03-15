# Phase 2.5 — Feed Refresh & New Episode Cache

## Goal

Build a periodic feed-checking mechanism so new episode badges stay accurate without the user manually visiting each podcast's detail page. Lays the shared caching foundation for Phase 3 mobile push notifications.

---

## Problem

Currently `new_episode_count` and `latest_episode_pub_date` only update when the user opens a specific podcast's detail page. Sidebar and profile badges are stale until then — defeating the purpose of a badge system.

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

(`latest_episode_pub_date`, `last_visited_at`, `episode_filter` already exist from Phase 2.)

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

`last_feed_checked_at` is the shared cache key. Phase 3 options:

**Option A — Supabase Edge Function cron (preferred):**
- Runs every hour; iterates all subscriptions across all users
- Updates DB directly; mobile reads fresh counts on next launch
- Enables server-side push notifications via Expo Push API
- No mobile background task needed

**Option B — Expo BackgroundFetch:**
- Mobile background task calls the same refresh endpoint
- Triggers local notification if `new_episode_count` increased
- Less reliable on iOS (OS can throttle/defer background tasks)

Option A is preferred — centralised, works even when the app isn't running, and the infrastructure serves both web and mobile.

---

## Out of Scope for Phase 2.5

- Push notifications (Phase 3 — requires APNs/FCM + Expo Push setup)
- Supabase Edge Function cron (Phase 3 — implement when building mobile)
- Per-subscription configurable refresh interval

---

## Critical Files

| File | Change |
|---|---|
| `supabase/migrations/20260315000000_subscription_feed_cache.sql` | New — `last_feed_checked_at` column |
| `src/app/api/subscriptions/refresh/route.ts` | New — POST handler |
| `src/components/ui/Sidebar.tsx` | Call `maybeRefresh()` after initial load |
| `docs/api.md` | Document `POST /api/subscriptions/refresh` |
| `docs/data-model.md` | Document `last_feed_checked_at` column |
| `docs/plans/phase-3-mobile.md` | Note Supabase cron as preferred push notification mechanism |

---

## Verification

1. Open app → Network tab shows `POST /api/subscriptions/refresh` fires after sidebar loads
2. Reload within 1 hour → refresh is NOT called (localStorage gate)
3. Set `last_feed_checked_at = null` in DB on a subscription → refresh re-checks that feed on next load
4. Paid user with `episode_filter`: confirm count is filtered; free user: confirm it is not
5. Open 3 tabs simultaneously → only 1 refresh call fires
6. Simulate 50 subscriptions: confirm no more than 10 concurrent RSS fetches in flight
