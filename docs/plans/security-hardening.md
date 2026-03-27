# Plan: Security Hardening — Abuse & Misuse Vectors

## Context

A security review of the podcast app identified several abuse vectors. This plan addresses the
realistic, fixable issues in order of impact. Infrastructure-level rate limiting (Upstash, Vercel
Edge Config) is out of scope here — we focus on targeted, in-code fixes.

---

## Issues Not Addressed Here (conscious skip)

- **Per-IP rate limiting**: Needs Vercel middleware + Upstash or similar — big lift, low urgency for current scale.
- **Freemium race condition** (queue/playlist count-then-insert): Window is tiny; requires DB-level constraints or atomic counters. Low real-world impact at current scale.
- **iTunes API enumeration via `/api/podcasts/*`**: It's public data anyway; the "loss" is negligible.
- **`/api/podcasts/unseen` info disclosure**: The `episodes` table is a shared cache with no PII; revealing whether a feed URL exists in it is harmless.
- **Dev routes** (`/api/dev/upgrade`, `/api/dev/downgrade`): Already safe — both gates on `process.env.NODE_ENV !== 'development'`, and Vercel sets `NODE_ENV=production` automatically. No code change needed. Just verify this in the Vercel dashboard.

---

## Fix 1 — Chapters route: Block SSRF ✅

**File:** `web/src/app/api/podcasts/chapters/route.ts`

**Problem:** Accepts any `?url=` and fetches it — attacker can probe `http://169.254.169.254/` (AWS metadata), `http://localhost:3000/admin`, or map internal services.

**Fix:**
- Reject if URL scheme is not `https:`
- Reject if hostname resolves to a private/loopback range (simple string match on common private patterns: `localhost`, `127.`, `10.`, `192.168.`, `169.254.`, `::1`)
- Return `{ chapters: [] }` (same as current error path) so callers are unaffected

```ts
function isSafeChapterUrl(raw: string): boolean {
  let parsed: URL
  try { parsed = new URL(raw) } catch { return false }
  if (parsed.protocol !== 'https:') return false
  const h = parsed.hostname.toLowerCase()
  const blocked = ['localhost', '127.', '10.', '192.168.', '172.16.', '169.254.', '::1', '[::1]']
  return !blocked.some(b => h === b || h.startsWith(b))
}
```

---

## Fix 2 — OPML import: Throttle parallel RSS fetches ✅

**File:** `web/src/app/api/opml/import/route.ts`

**Problem:** `Promise.all()` fires up to 200 simultaneous outbound HTTP requests. An attacker can upload a crafted OPML with 200 URLs pointing at slow servers, exhausting Vercel's connection pool.

**Fix:**
1. Add a **file size cap** before parsing: reject if `text.length > 500_000` (500 KB)
2. Replace `Promise.all()` with **batched sequential fetches** (5 at a time):

```ts
async function fetchInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T, i: number) => Promise<unknown>
) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.all(batch.map((item, j) => fn(item, i + j))))
  }
  return results
}
```

3. Validate extracted feed URLs are `https://` before fetching (skip non-https silently).

---

## Fix 3 — Feed route: Gate `nocache=1` behind auth ✅

**File:** `web/src/app/api/podcasts/feed/route.ts`

**Problem:** Any anonymous user can force a fresh RSS parse on every request, bypassing the 1-hour server cache and hammering the Supabase Edge Function + upstream RSS servers.

**Fix:** Only honour `nocache=1` for authenticated users. If the caller is unauthenticated and passes `nocache=1`, silently ignore it (fall through to cached path).

```ts
import { createClient } from '@/lib/supabase/server'

// inside GET:
const nocacheRequested = req.nextUrl.searchParams.get('nocache') === '1'
let nocache = false
if (nocacheRequested) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  nocache = !!user
}
```

---

## Fix 4 — Subscription refresh: Per-user cooldown ✅

**File:** `web/src/app/api/subscriptions/refresh/route.ts`

**Problem:** A user with 500 subscriptions (all stale) can call this endpoint repeatedly, each time triggering up to 500 outbound RSS fetches (in batches of 10 but still unbounded overall).

**Fix:** The route already tracks `last_feed_checked_at` per subscription. Add a global per-user cooldown: if the most-recently-checked subscription was updated in the last **2 minutes**, return early with the current subscriptions without fetching anything.

```ts
// After fetching existing subscriptions, before the stale filter:
const mostRecentCheck = subs.reduce((max, s) =>
  s.last_feed_checked_at && s.last_feed_checked_at > max ? s.last_feed_checked_at : max, '')
const COOLDOWN_MS = 2 * 60 * 1000
if (mostRecentCheck && Date.now() - new Date(mostRecentCheck).getTime() < COOLDOWN_MS) {
  return NextResponse.json({ subscriptions: subs })
}
```

---

## Fix 5 — Progress save: Sanitize positionSeconds (skipped — already handled)

**File:** `web/src/app/api/progress/route.ts`

**Problem:** When `duration` is absent/null, `positionSeconds` is stored verbatim. A caller can persist `-999999999` or absurd values that break client-side position calculations.

**Fix:** Clamp `positionSeconds` to `[0, 86400]` (0 to 24 hours — no real podcast is longer):

```ts
const safePositionSeconds = Math.max(0, Math.min(positionSeconds ?? 0, 86400))
```

Use `safePositionSeconds` everywhere `positionSeconds` is used after parsing.

---

## Verification

After implementing each fix:

1. **Chapters SSRF** — Test with `?url=http://localhost:3000`, `?url=http://169.254.169.254/`, `?url=ftp://evil.com/` — all should return `{ chapters: [] }`. Test with a real HTTPS chapter URL — should still work.

2. **OPML batching** — Upload a valid OPML with 10+ feeds, confirm it still imports. Upload a 600KB text file, confirm it rejects with 400. Check server logs show sequential batches not a flood.

3. **Feed nocache gate** — As a logged-out user, confirm `?nocache=1` is silently ignored (cached response returned). As a logged-in user, confirm `?nocache=1` still forces a fresh fetch.

4. **Refresh cooldown** — Call `POST /api/subscriptions/refresh` twice in quick succession; second call should return immediately without making any outbound fetches.

5. **Progress sanitize** — `POST /api/progress` with `{ positionSeconds: -5, ... }` should store `0`. With `positionSeconds: 999999` should store `86400`.

Run `cd web && npm test -- --run` and `cd web && npm run build` after all changes.
