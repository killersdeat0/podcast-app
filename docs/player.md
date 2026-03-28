# Player Architecture

The player is split into two files:

- `src/components/player/PlayerContext.tsx` — state and controls (React context)
- `src/components/player/Player.tsx` — the audio element and UI

---

## PlayerContext

Provides global playback state and controls via `usePlayer()`. Wraps the entire `(app)` layout.

### State

| Field | Type | Notes |
|---|---|---|
| `nowPlaying` | `NowPlaying \| null` | Currently loaded episode |
| `playing` | `boolean` | Whether audio is currently playing |
| `speed` | `number` | Current playback rate |

### NowPlaying shape

```ts
interface NowPlaying {
  guid: string
  feedUrl: string
  title: string
  podcastTitle: string
  artworkUrl: string
  audioUrl: string
  duration: number
  chapterUrl?: string | null
}
```

### Controls

| Method | Description |
|---|---|
| `play(episode)` | Load a new episode, set `playing = true`, persist to `localStorage` |
| `togglePlay()` | Pause or resume via the `audioRef` |
| `seek(seconds)` | Set `audio.currentTime` directly |
| `setSpeed(speed)` | Update `playbackRate` on the audio element and save to state |
| `audioRef` | Ref to the underlying `<audio>` element |

### localStorage persistence
On mount, `PlayerContext` reads `localStorage.getItem('nowPlaying')` and restores it to state. This is done in a `useEffect` (not initial state) to avoid SSR hydration mismatches — the server renders with `nowPlaying = null`, then the client fills it in after mount.

`play()` always writes the episode to `localStorage` so the player survives page navigation and refreshes.

---

## Player component

`Player` is rendered once inside the app layout column. It always renders an `<audio>` element (even with no episode loaded) so event listeners attach on mount and aren't torn down on episode changes.

The visible UI is shown only when `nowPlaying !== null`.

### Episode load flow

When `nowPlaying` changes:
1. `audio.src` is set to the new episode's `audioUrl`
2. `GET /api/progress` is called to fetch the saved position
3. If `positionSeconds > 5`, seeks to that position (avoids re-seeking to 0 for nearly-unplayed episodes)
4. If `playing` is true, calls `audio.play()`

### Progress saving

On every `timeupdate` event, if at least 10 seconds have passed since the last save and `currentTime > 5`, it throttles a `POST /api/progress` call with the current position. The 10-second throttle uses `lastSavedAt` ref (not state, to avoid re-renders).

Progress saves both `position_seconds` (used for seeking on resume) and `position_pct` (used for display in history/queue/playlist). `position_pct` is computed from `audioRef.current.duration` — the real audio duration as decoded by the browser — rather than the RSS `<itunes:duration>` field, which is publisher-provided and frequently wrong (often by 5–10 minutes due to dynamic ad insertion).

#### RSS duration vs. real audio duration

`<itunes:duration>` reflects the "clean" episode the publisher uploaded. Ad platforms (AdsWizz, Megaphone, Spotify DAI) stitch pre-roll, mid-roll, and post-roll ads in at serve time, so the audio file delivered to the client is longer than the RSS value. There is no standard mechanism for a player to know the true duration before loading the audio.

**Impact on `position_seconds` resume accuracy with dynamic ads:** If the number or position of mid-roll ad slots changes between the session when progress was saved and the session when the user resumes, `position_seconds` may land in a slightly different spot in the content. `position_pct` is more resilient to this because ads cluster at fixed break points rather than being uniformly distributed — 68% through is still roughly 68% through the content regardless of which ads were served.

**Known caveat:** If a mid-roll ad is added or removed *at the exact break point where the user paused*, resume position can drift by up to one ad slot length (~60s). This is an inherent limitation of DAI without chapter/cue-point metadata from the publisher, and is the same behavior as Apple Podcasts and Spotify for externally hosted feeds. A proper fix would require publishers to expose ad break timestamps (e.g. via Podlove chapters or VAST cue points), which is out of scope.

### Completion threshold

Episodes are considered complete when `(currentTime / duration) * 100 >= COMPLETION_THRESHOLD_PCT` (currently **98%**). This constant lives in `src/lib/player/constants.ts` and is shared with the history page's "Done" indicator.

**At 98% (`onTime`):** saves `completed: true` to the DB and dispatches `progress-saved` so the "Done" indicator appears in history/queue/playlist — but playback continues uninterrupted. `hasCompletedRef` is set to `true` to stop the 10s interval save from overwriting the completion.

**Seeking back below 98% (`onSeeked`):** if `hasCompletedRef` is true and the user scrubs below the threshold, `hasCompletedRef` resets to `false` and a `progress-saved` event fires with `completed: false` so the UI un-completes immediately. The next 10s interval save then persists `completed: false` to the DB.

**At `ended`:** `completeAndAdvance` is always called (regardless of `hasCompletedRef`). The 98% threshold saves completed:true to DB ahead of time, so `completeAndAdvance` re-saves idempotently — this is fine. `hasCompletedRef` is only used to guard the 10s interval save, not the advance. This is the only place auto-advance fires.

### Episode completion flow (`completeAndAdvance`)

Triggered only by the `ended` audio event (not the 98% threshold).

**Authenticated users:**
1. `POST /api/progress` with `completed: true` and `positionSeconds = audio.duration`
2. `GET /api/queue` to fetch the current queue
3. Find the current episode's index in the queue
4. `DELETE /api/queue` to remove the completed episode
5. If there's a next item in the queue, call `play()` with it

**Guests:**
- Steps 1–4 are skipped (no API calls)
- Uses `clientQueue` from `PlayerContext` for auto-advance: dequeues via `dequeueClient`, calls `play()` with the next item

> **TODO:** Play an audio ad clip between steps 1 and 5 for free-tier users (see comment in source).

### Undo accidental skip

When the player auto-advances (via `completeAndAdvance`) or the user manually skips (`skipToNext`), a 5-second sonner toast appears with an **Undo** action. Tapping Undo restores the previous episode and seeks to the saved position.

**Implementation (all in `Player.tsx`):**

- `previousEpisodeRef` — ref holding `{ episode: NowPlaying; positionSeconds: number } | null`. Populated *before* the advance fires; cleared after a successful undo or when a new episode is deliberately loaded.
- `pendingSeekRef` — ref holding a position in seconds. Set by `restorePreviousEpisode`; consumed in the `nowPlaying` sync `useEffect` via a one-shot `canplay` listener that seeks the audio to that position after the episode loads.
- `restorePreviousEpisode` — reads `previousEpisodeRef`, calls `play(prev.episode)`, sets `pendingSeekRef`, clears the ref.

**Paths that trigger the undo toast:**
| Path | Condition |
|---|---|
| `skipToNext` (authenticated) | Next item found in queue after removing current |
| `skipToNext` (guest) | Next item found in `clientQueue` |
| `completeAndAdvance` (authenticated) | Queue has a next item after removing completed |
| `completeAndAdvance` (guest `onEnded`) | `clientQueue` has a next item |

The toast is **not** shown when the queue is empty (nothing to undo to) or when playback ends with no next item.

### Next episode button (`skipToNext`)

A skip-forward button appears in the player when there's a next item in the queue. Unlike `completeAndAdvance`, this does **not** mark the episode as complete — it lets the user resume from where they left off.

**Authenticated users:**
1. If `currentTime > 5`, `POST /api/progress` with `completed: false` and the current position (so the user can resume)
2. `GET /api/queue` to find the current episode's index
3. `DELETE /api/queue` to remove the current episode from the queue
4. Call `play()` with the next item

**Guests:**
- No API calls; uses `clientQueue` for next-item lookup
- Dequeues via `dequeueClient`, calls `play()` with the next item

**Queue state for the next button:** `Player` maintains a `dbQueue` state (fetched from `/api/queue` whenever `nowPlaying` changes) for authenticated users. For guests, `clientQueue` from `PlayerContext` is used. `hasNextInQueue` is derived from whichever is active. The button is hidden when `!hasNextInQueue`.

### Chapters

When `nowPlaying.chapterUrl` is set, a `GET /api/podcasts/chapters` fetch runs on episode change. Chapter markers are rendered as small tick marks on the progress bar. Clicking a tick seeks to that chapter. The current chapter title is shown below the scrubber.

### Sleep timer

A dropdown lets users set a sleep timer (5–60 minutes). When the timer fires, `audio.pause()` is called. Implemented with `setTimeout` in a ref — does not use state so it doesn't trigger re-renders.

### Volume control

Volume is controlled via `audio.volume` (0–1). State is held in `Player` as `volume` (default `1`) and synced to the audio element via a `useEffect`. It persists to `localStorage` under the key `playback-volume` and is restored on mount alongside speed.

- **Desktop:** a mute-toggle icon button + range slider (`w-16`, step `0.05`) sit inline with the speed and sleep dropdowns.
- **Mobile:** a "Volume" row in the `···` menu opens a submenu with the same mute button + slider.
- Clicking the icon toggles between `0` (mute) and `1` (full). The icon cycles through `VolumeX` → `Volume1` → `Volume2` (Lucide) based on the current level.

### Freemium: playback speed

`Player` receives `isFreeTier: boolean` as a prop (read from the user's profile in the layout server component).

- Free tier: speed options `[1, 2]` + "Upgrade for more speeds" link
- Paid tier: full range `[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]`

**Speed persistence:**

| Key | Written by | Read by | Notes |
|---|---|---|---|
| `playback-speed` | Settings page | Player on mount | Global default speed |
| `podcast-speed-{feedUrl}` | Podcast detail page (paid only) | Player on episode load | Per-show override |

**Player speed control is ephemeral.** Changing speed in the player affects `audio.playbackRate` and UI state for the current session only. It does **not** write to `localStorage`. The speed selector in the player is a session override.

**Global default speed** is set on the Settings page. It writes to `localStorage` under `playback-speed` and is restored by the Player on mount.

**Per-show speed** is set explicitly on the podcast detail page (paid users only, visible only when subscribed). Options are "Follow global" (clears the per-show key) or a specific speed from `ALL_SPEEDS`. The control reads `podcast-speed-{feedUrl}` from `localStorage` on mount and writes or removes it on change.

Speed logic lives in `src/lib/player/speed.ts` (`resolveEpisodeSpeed`, `saveSpeedPreference`). On episode load, the per-show key is checked first; if absent, `globalSpeed` is used. For free-tier users any stored speed is clamped to `Math.min(2, stored)` then snapped to the nearest value in `FREE_SPEEDS = [1, 2]`.

### Mobile layout

On narrow viewports (below the `md` breakpoint):

- The right-side panel (speed selector + sleep timer) is hidden (`hidden md:flex`).
- The left artwork panel drops its fixed width and shrinks to fit.
- A `···` button appears to the right of the transport controls, opening a two-level menu:
  - **Main level:** lists available actions (Playback Speed + Volume, each showing the current value inline).
  - **Speed submenu:** back button + the available speed options for the user's tier.
  - **Volume submenu:** back button + mute-toggle icon + range slider.
- Selecting a speed closes the menu and calls `handleSetSpeed()`, which updates the session speed only (ephemeral — does not persist to `localStorage`).

To add future mobile-only options, add another row to the `mobileMenu === 'main'` block in `Player.tsx`.

---

## `progress-saved` custom event

`window.dispatchEvent(new CustomEvent('progress-saved', { detail: { guid, positionSeconds, positionPct, completed } }))`

Fired from `Player.tsx` at the 98% completion threshold and by `completeAndAdvance`. Listeners:

- **History page:** does in-place position updates from the payload (no refetch) to avoid overwriting optimistic ordering. Falls back to a full refetch only when the episode isn't in the list yet.
- **Queue and playlist pages:** do full refetches (safe — their ordering is by a static `position` column).

## Progress display coordination

Queue, history, playlist, and the podcast episode list all show playback progress. When changing how progress is fetched or displayed, **update all four together**.

All use the same priority chain: `livePct` (from live audio while playing) → `position_pct` (stored in DB, accurate) → RSS-math fallback (inaccurate for ad-heavy podcasts due to dynamic ad insertion).

Live position state resets via `useLayoutEffect` (not `useEffect`) on episode change — this prevents the previous episode's position from showing on the newly-playing row before the browser paints.

---

## Layout integration

`Player` lives inside the main content column in `src/app/(app)/layout.tsx`, not as a fixed overlay. This means:

- It naturally sits below `<main>` in the column flow
- No padding hacks needed on the sidebar or main content
- Sidebar sign-out button is never obscured by the player bar
