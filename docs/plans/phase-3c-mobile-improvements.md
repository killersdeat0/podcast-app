# Phase 3c — Mobile: Improvements Parity

## Goal
Bring the web improvements shipped in the "Now" batch (roadmap items 2–4) to the mobile app. All DB columns and API endpoints are already live in both dev and prod environments — mobile just needs to read/write them.

Builds on top of Phase 3b. Assumes `PlayerFeature`, `SettingsScreen`, and `PodcastDetailScreen` from Phase 3b are in place.

---

## Features

### 1. Per-Show Playback Speed

**Web reference:** `web/src/app/(app)/podcast/[id]/page.tsx`, `web/src/lib/player/speed.ts`

**DB column:** `subscriptions.speed_override FLOAT NULL` (migration `20260327000000` — already applied)

**API:** `PATCH /api/subscriptions` Body B with `speedOverride: number | null`

**Behavior:**
- On `PodcastDetailScreen` mount: read `speed_override` from the subscription row returned by `GET /subscriptions` (or Supabase KMP direct query). Cache locally (in-memory or `DataStore`) as `podcast-speed-{feedUrl}`.
- Show a speed picker in the podcast detail screen, inline with the Follow/Unfollow button row. **Paid + subscribed users only** — hide for free tier or unsubscribed guests.
- On speed change: write to local cache immediately; call `PATCH /api/subscriptions` (or direct Supabase upsert) with `speedOverride`.
- `PlayerFeature` on episode load: read per-show speed from local cache, fall back to global default speed preference.
- Free tier: clamp speed to 1x or 2x (same as web `FREE_SPEEDS = [1, 2]`).

**Tasks:**
- [ ] `PodcastDetailViewModel`: load `speed_override` from subscription; expose as `StateFlow<Float?>`
- [ ] `PodcastDetailScreen`: add speed picker composable (paid+subscribed only); trigger `updateSpeedOverride(speed)`
- [ ] `PodcastDetailViewModel.updateSpeedOverride`: write to local cache + call API
- [ ] `PlayerViewModel`: on episode load, call `resolveEpisodeSpeed(feedUrl, globalSpeed, isPaid)` — read from local cache, fall back to global
- [ ] Unit tests: `resolveEpisodeSpeed` (same logic as `web/src/lib/player/speed.ts`)

---

### 2. Undo Accidental Skip

**Web reference:** `web/src/components/player/Player.tsx` (`skipToNext`, `restorePreviousEpisode`, `previousEpisodeRef`, `pendingSeekRef`)

**DB:** No new columns. Uses `POST /api/queue` with `prepend: true` (queue prepend RPC already applied).

**Behavior:**
- When the user taps skip-forward in the Full Player:
  - Compute `pctPlayed = currentPosition / duration * 100`
  - If `pctPlayed < 95`: snapshot `previousEpisode` + `previousPositionSeconds` in `PlayerViewModel`; show a Snackbar ("Skipped: {title}") with an **Undo** action (duration: ~8 seconds)
  - If `pctPlayed >= 95`: skip silently (episode is nearly done, undo would be confusing)
- On auto-advance (`completeAndAdvance`): no snapshot, no snackbar.
- **Undo tapped:**
  1. Call `play(previousEpisode)` immediately
  2. Seek to `previousPositionSeconds` once audio is loaded (`pendingSeek` pattern)
  3. If episode was from the queue: call `POST /api/queue` with `prepend: true` to restore it to position 0. For guest/unauthenticated users: prepend to in-memory client queue.
  4. Dispatch `queue-changed` equivalent (refresh Queue screen)
- Clear `previousEpisode` snapshot when:
  - Another skip happens (new snapshot replaces it)
  - Auto-advance fires (`completeAndAdvance`)
  - Snackbar dismisses without undo

**Tasks:**
- [ ] `PlayerViewModel`: add `previousEpisode: NowPlaying?` + `previousPositionSeconds: Int` state
- [ ] `PlayerViewModel.skipToNext`: compute pct, snapshot if < 95%, show `UndoSnackbar` event
- [ ] `PlayerViewModel.completeAndAdvance`: clear snapshot, no snackbar
- [ ] `FullPlayerScreen`: observe snackbar event; show `SnackbarHost` with "Undo" action
- [ ] `PlayerViewModel.undoSkip`: restore episode, seek, prepend to queue
- [ ] `QueueViewModel`: handle queue prepend API call (`POST /api/queue` with `prepend: true`)
- [ ] Unit tests: skip at 94% shows snackbar; skip at 96% does not; undo restores position; completeAndAdvance clears snapshot

---

### 3. Default Volume — Cross-Device Sync

**Web reference:** `web/src/app/(app)/settings/page.tsx`, `web/src/app/api/profile/route.ts`

**DB column:** `user_profiles.default_volume FLOAT NULL` (migration `20260327000002` — already applied)

**API:**
- `GET /api/profile` → response now includes `defaultVolume: Float?`
- `PATCH /api/profile` with `{ defaultVolume: Float }` to save

**Behavior:**
- On `SettingsScreen` open (or `PlayerViewModel` init for authenticated users): call `GET /api/profile`, read `defaultVolume`. If non-null, apply to audio player and save to local preference store (DataStore Preferences).
- On volume change in Settings: write to DataStore immediately; call `PATCH /api/profile` with new value.
- Local DataStore key: `playback_volume` (mirrors web `playback-volume` localStorage key).
- Clamp to `[0.0, 1.0]`.

**Tasks:**
- [ ] `SettingsViewModel`: call `GET /api/profile` on open; apply `defaultVolume` to DataStore + audio
- [ ] `SettingsScreen`: add volume slider (same range 0–1, step 0.05, show % label)
- [ ] `SettingsViewModel.updateDefaultVolume(v: Float)`: write DataStore + call `PATCH /api/profile`
- [ ] `PlayerViewModel` init: read DataStore `playback_volume` and apply to `AudioPlayer`
- [ ] Unit tests: `updateDefaultVolume` clamps input; DataStore write + API call both fire; API call is skipped for guest users

---

### 4. Skip Intervals — Cross-Device Sync

**Web reference:** `web/src/app/(app)/settings/page.tsx`, `web/src/app/api/profile/route.ts`

**DB columns:** `user_profiles.skip_back_seconds INTEGER NULL`, `user_profiles.skip_forward_seconds INTEGER NULL` (migration `20260401000000` — already applied)

**API:**
- `GET /api/profile` → response includes `skipBackSeconds: Int?` and `skipForwardSeconds: Int?`
- `PATCH /api/profile` with `{ skipBackSeconds: Int }` or `{ skipForwardSeconds: Int }` to save

**Behavior:**
- On `SettingsScreen` open: call `GET /api/profile`, read `skipBackSeconds` / `skipForwardSeconds`. If non-null, update local preference store (DataStore Preferences) — overwrites any device-local values so cross-device changes are applied.
- Defaults: 15s back / 30s forward (used when DB value is null).
- On skip interval change in Settings: write to DataStore immediately; call `PATCH /api/profile` with new value.
- `PlayerViewModel` on episode load: read DataStore keys `skip_back_seconds` / `skip_forward_seconds` and apply to skip controls.
- Guest users: use DataStore values only; do not call `PATCH /api/profile`.

**Tasks:**
- [ ] `SettingsViewModel`: call `GET /api/profile` on open; apply `skipBackSeconds` / `skipForwardSeconds` to DataStore
- [ ] `SettingsScreen`: add two dropdown rows ("Skip back" / "Skip forward") with options `[5, 10, 15, 20, 30, 45, 60, 90]` seconds
- [ ] `SettingsViewModel.updateSkipBack(secs: Int)` / `updateSkipForward(secs: Int)`: write DataStore + call `PATCH /api/profile` (skip API call for guests)
- [ ] `PlayerViewModel` init: read DataStore `skip_back_seconds` / `skip_forward_seconds`; apply to skip button labels and seek delta
- [ ] Unit tests: defaults used when DataStore empty; DB value overwrites local on sync; guest skips API call

---

## API Summary (already live)

| Endpoint | Change | Used by |
|----------|--------|---------|
| `PATCH /api/subscriptions` Body B | Added `speedOverride?: number \| null` | Per-show speed |
| `GET /api/profile` | Added `defaultVolume: number \| null` | Default volume sync |
| `GET /api/profile` | Added `skipBackSeconds: number \| null`, `skipForwardSeconds: number \| null` | Skip interval sync |
| `PATCH /api/profile` | Updates `default_volume` | Default volume sync |
| `PATCH /api/profile` | Updates `skip_back_seconds` / `skip_forward_seconds` | Skip interval sync |
| `POST /api/queue` | Added `prepend?: boolean` | Undo skip queue restore |

## DB Summary (already applied to both envs)

| Migration | Column | Table | Used by |
|-----------|--------|-------|---------|
| `20260327000000` | `speed_override FLOAT NULL` | `subscriptions` | Per-show speed |
| `20260327000001` | `increment_queue_positions(p_user_id)` RPC | — | Undo skip queue prepend |
| `20260327000002` | `default_volume FLOAT NULL` | `user_profiles` | Default volume sync |
| `20260401000000` | `skip_back_seconds INTEGER NULL`, `skip_forward_seconds INTEGER NULL` | `user_profiles` | Skip interval sync |

---

## Testing Checklist

- [ ] Per-show speed: set 1.5x on paid plan, close app, reopen — speed restored from DB
- [ ] Per-show speed: not shown for free users (picker hidden)
- [ ] Per-show speed: carried into Full Player when episode loads
- [ ] Undo skip: skip at 94% → snackbar appears; tap Undo → returns to same position
- [ ] Undo skip: skip at 96% → no snackbar
- [ ] Undo skip: complete via natural end → no snackbar
- [ ] Undo skip: queue episode skipped → restored to queue front after undo
- [ ] Default volume: change on device A → open app on device B → same volume applied
- [ ] Default volume: guest user → no PATCH call made
- [ ] Skip intervals: change on device A → open app on device B → same skip durations applied
- [ ] Skip intervals: default 15s back / 30s forward used when no DB value set
- [ ] Skip intervals: guest user → no PATCH call made; DataStore values used locally
