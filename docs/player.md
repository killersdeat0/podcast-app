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

### Episode end flow (`onEnded`)

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

### Chapters

When `nowPlaying.chapterUrl` is set, a `GET /api/podcasts/chapters` fetch runs on episode change. Chapter markers are rendered as small tick marks on the progress bar. Clicking a tick seeks to that chapter. The current chapter title is shown below the scrubber.

### Sleep timer

A dropdown lets users set a sleep timer (5–60 minutes). When the timer fires, `audio.pause()` is called. Implemented with `setTimeout` in a ref — does not use state so it doesn't trigger re-renders.

### Freemium: playback speed

`Player` receives `isFreeTier: boolean` as a prop (read from the user's profile in the layout server component).

- Free tier: speed options `[1, 2]` + "Upgrade for more speeds" link
- Paid tier: full range `[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]`

**Speed persistence (paid only):** When a paid user changes speed, it is saved to `localStorage` under the key `playback-speed`. On mount, `Player` restores this value by calling `setSpeed()` — so the preferred rate is applied before the first episode loads. Free-tier users always start at 1x.

### Mobile layout

On narrow viewports (below the `md` breakpoint):

- The right-side panel (speed selector + sleep timer) is hidden (`hidden md:flex`).
- The left artwork panel drops its fixed width and shrinks to fit.
- A `···` button appears to the right of the transport controls, opening a two-level menu:
  - **Main level:** lists available actions (currently: Playback Speed, showing the active speed inline).
  - **Speed submenu:** back button + the available speed options for the user's tier.
- Selecting a speed closes the menu and calls `handleSetSpeed()`, which also persists to `localStorage` for paid users.

To add future mobile-only options, add another row to the `mobileMenu === 'main'` block in `Player.tsx`.

---

## Layout integration

`Player` lives inside the main content column in `src/app/(app)/layout.tsx`, not as a fixed overlay. This means:

- It naturally sits below `<main>` in the column flow
- No padding hacks needed on the sidebar or main content
- Sidebar sign-out button is never obscured by the player bar
