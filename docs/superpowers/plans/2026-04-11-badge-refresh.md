# Badge Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix podcast badge latency — badges appear within an hour of tab focus, and clear instantly when leaving a podcast page.

**Architecture:** Two targeted wiring changes in existing files. Sidebar gains a `visibilitychange` listener that calls the existing `maybeRefresh()` (already hourly-gated). Podcast page replaces its `subscriptions-changed` dispatch on the clear path with a `subscription-count-reset` CustomEvent carrying the new count as payload, so the sidebar updates state directly without a round-trip fetch.

**Tech Stack:** React `useEffect`, `CustomEvent`, `document.visibilityState`, existing `/api/subscriptions/refresh` endpoint.

---

## File Map

| File | Change |
|------|--------|
| `web/src/components/ui/Sidebar.tsx` | Add `visibilitychange` + `subscription-count-reset` listeners inside existing `useEffect` |
| `web/src/app/(app)/podcast/[id]/page.tsx` | Replace `subscriptions-changed` dispatch with `subscription-count-reset` in unmount cleanup (line 487) and `proceedWithNavigation` (line 538) |

---

### Task 1: Sidebar — visibility-aware refresh

**Files:**
- Modify: `web/src/components/ui/Sidebar.tsx:150-178`

The existing `useEffect` registers `fetchSubs`, `maybeRefresh`, a `setInterval`, and a `subscriptions-changed` listener. We add two more listeners in the same effect:

1. `visibilitychange` — calls `maybeRefresh()` when the user returns to the tab
2. `subscription-count-reset` — updates subscriptions state directly from event payload (no fetch)

- [ ] **Step 1: Update the Sidebar useEffect**

Replace the block at lines 150–178 in `web/src/components/ui/Sidebar.tsx`:

```tsx
useEffect(() => {
  if (isGuest) return

  function fetchSubs() {
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSubscriptions(data) })
      .catch(() => {})
  }

  async function maybeRefresh() {
    const lastCalled = Number(localStorage.getItem('feed_refresh_last_called') ?? 0)
    if (Date.now() - lastCalled < 60 * 60 * 1000) return
    localStorage.setItem('feed_refresh_last_called', String(Date.now()))
    const res = await fetch('/api/subscriptions/refresh', { method: 'POST' })
    if (!res.ok) return
    const { subscriptions } = await res.json()
    setSubscriptions(subscriptions)
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') maybeRefresh()
  }

  function handleCountReset(e: Event) {
    const { feedUrl, newEpisodeCount } = (e as CustomEvent<{ feedUrl: string; newEpisodeCount: number }>).detail
    setSubscriptions((prev) =>
      prev.map((s) => s.feed_url === feedUrl ? { ...s, new_episode_count: newEpisodeCount } : s)
    )
  }

  fetchSubs()
  maybeRefresh()
  const interval = setInterval(maybeRefresh, 60 * 60 * 1000)
  window.addEventListener('subscriptions-changed', fetchSubs)
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('subscription-count-reset', handleCountReset)
  return () => {
    clearInterval(interval)
    window.removeEventListener('subscriptions-changed', fetchSubs)
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('subscription-count-reset', handleCountReset)
  }
}, [isGuest])
```

- [ ] **Step 2: Build check**

```bash
cd web && npm run build
```

Expected: no TypeScript errors. Fix any before continuing.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ui/Sidebar.tsx
git commit -m "feat: refresh badges on tab focus and clear instantly via event payload"
```

---

### Task 2: Podcast page — replace subscriptions-changed on clear path

**Files:**
- Modify: `web/src/app/(app)/podcast/[id]/page.tsx:472-489` (unmount cleanup)
- Modify: `web/src/app/(app)/podcast/[id]/page.tsx:525-542` (`proceedWithNavigation`)

There are exactly two places where `subscriptions-changed` is dispatched as part of resetting the count to 0. Both need to switch to `subscription-count-reset` with the payload. The other `subscriptions-changed` dispatches on the mount path (line 466, after updating count on load) are unchanged — those are correct.

- [ ] **Step 1: Fix unmount cleanup (line 487)**

In the `useEffect` at lines 472–489, replace:

```ts
window.dispatchEvent(new Event('subscriptions-changed'))
```

with:

```ts
window.dispatchEvent(new CustomEvent('subscription-count-reset', {
  detail: { feedUrl, newEpisodeCount: 0 },
}))
```

The full cleanup block should now read:

```ts
useEffect(() => {
  if (!feedUrl || !subscribed) return
  return () => {
    if (hasResetRef.current) return
    fetch('/api/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedUrl,
        lastVisitedAt: new Date().toISOString(),
        newEpisodeCount: 0,
      }),
      keepalive: true,
    }).catch(() => {})
    window.dispatchEvent(new CustomEvent('subscription-count-reset', {
      detail: { feedUrl, newEpisodeCount: 0 },
    }))
  }
}, [feedUrl, subscribed])
```

- [ ] **Step 2: Fix proceedWithNavigation (line 538)**

In `proceedWithNavigation`, replace:

```ts
window.dispatchEvent(new Event('subscriptions-changed'))
```

with:

```ts
window.dispatchEvent(new CustomEvent('subscription-count-reset', {
  detail: { feedUrl, newEpisodeCount: 0 },
}))
```

The full function should now read:

```ts
async function proceedWithNavigation() {
  setNavWarningOpen(false)
  isBeforeUnloadRef.current = false
  const pending = pendingNavRef.current
  pendingNavRef.current = null
  if (feedUrl && subscribed) {
    hasResetRef.current = true
    await fetch('/api/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedUrl, lastVisitedAt: new Date().toISOString(), newEpisodeCount: 0 }),
    }).catch(() => {})
    window.dispatchEvent(new CustomEvent('subscription-count-reset', {
      detail: { feedUrl, newEpisodeCount: 0 },
    }))
  }
  if (pending) {
    router.push(pending.href)
  }
}
```

- [ ] **Step 3: Build and lint check**

```bash
cd web && npm run build && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run unit tests**

```bash
cd web && npm test -- --run
```

Expected: all existing tests pass. No new tests needed — these are event dispatch wiring changes with no extractable logic.

- [ ] **Step 5: Manual smoke test**

With `npm run dev` running:
1. Subscribe to a podcast that has a badge count > 0 (use `/api/dev/reset-last-visited` if needed to generate one)
2. Navigate away from the podcast page — badge should disappear immediately in the sidebar (no stale count)
3. Switch to another tab and back — if the hourly cooldown has elapsed, a refresh fires; otherwise no network request

- [ ] **Step 6: Commit**

```bash
git add web/src/app/(app)/podcast/[id]/page.tsx
git commit -m "fix: dispatch subscription-count-reset with payload instead of subscriptions-changed on clear"
```
