# Badge Refresh Design

**Date:** 2026-04-11  
**Status:** Approved, ready for implementation

## Problem

Podcast badges (new episode counts in the sidebar) have two latency issues:

1. **Slow to appear** — new episodes show up in the badge only after the hourly background refresh fires, or after manually visiting the podcast page. No refresh happens when the user returns to the tab.

2. **Slow to clear** — when leaving a podcast page, the sidebar fires `subscriptions-changed` before the PATCH to reset `new_episode_count` completes. The sidebar re-fetches stale data, so the badge lingers until the next fetch.

## Design

### Fix 1: Visibility-aware refresh (appear side)

Add a `visibilitychange` listener in `Sidebar.tsx`. When `document.visibilityState === 'visible'`, call `maybeRefresh()`.

`maybeRefresh()` already gates on a 1-hour `localStorage` cooldown (`feed_refresh_last_called`), so:
- Frequent tab switches are cheap — just a `Date.now()` comparison, no network.
- A real RSS refresh fires at most once per hour, same as today, but now triggered when the user actually returns to the tab rather than on a fixed clock interval.

No changes to the server refresh route or cooldown logic.

### Fix 2: Event-with-payload on clear (clear side)

Replace the `subscriptions-changed` dispatch on the clear path with a new `subscription-count-reset` CustomEvent that carries the updated state as payload. The sidebar listens for this event and updates its local state directly — no round-trip fetch, no race.

**Podcast page (unmount cleanup + `proceedWithNavigation`):**
```ts
window.dispatchEvent(new CustomEvent('subscription-count-reset', {
  detail: { feedUrl, newEpisodeCount: 0 }
}))
```

**Sidebar (new listener):**
```ts
window.addEventListener('subscription-count-reset', (e) => {
  const { feedUrl, newEpisodeCount } = (e as CustomEvent).detail
  setSubscriptions(prev =>
    prev.map(s => s.feed_url === feedUrl ? { ...s, new_episode_count: newEpisodeCount } : s)
  )
})
```

The PATCH to persist `new_episode_count: 0` still runs in the background — it keeps the DB in sync for other devices and for sidebar remounts. The event just ensures the current session's UI doesn't wait for it.

The existing `subscriptions-changed` dispatch on the podcast page **mount** path (which updates counts after loading new episodes) is unchanged — that one correctly awaits the PATCH before firing.

## Files Changed

| File | Change |
|------|--------|
| `web/src/components/ui/Sidebar.tsx` | Add `visibilitychange` listener → `maybeRefresh()`; add `subscription-count-reset` listener → state update |
| `web/src/app/(app)/podcast/[id]/page.tsx` | Replace `subscriptions-changed` dispatch in unmount cleanup and `proceedWithNavigation` with `subscription-count-reset` CustomEvent |

## No changes needed

- No new API routes
- No DB schema changes
- No changes to `/api/subscriptions/refresh`
- No new custom events beyond `subscription-count-reset`

## Event contract

```ts
// Fired by: podcast page unmount cleanup, proceedWithNavigation
// Consumed by: Sidebar
window.dispatchEvent(new CustomEvent('subscription-count-reset', {
  detail: {
    feedUrl: string,       // identifies which subscription to update
    newEpisodeCount: number  // always 0 on current usage
  }
}))
```
