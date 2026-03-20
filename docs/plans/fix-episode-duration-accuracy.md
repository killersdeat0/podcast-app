# Fix: Episode Duration Accuracy (Live Audio Duration)

## Problem

`<itunes:duration>` in RSS feeds is publisher-provided and frequently wrong (e.g. Dateline NBC claims 31m in RSS but actual audio is 37:50). Every page that uses the stored `duration` from the DB or RSS feed as a denominator for progress % and "X LEFT" calculations shows incorrect values.

The queue page was already fixed (PR in current branch). The following pages still need the same treatment.

## Root cause

- **RSS parser** → `parseDuration()` stores whatever the publisher puts in `<itunes:duration>`
- **DB `episodes.duration`** is populated from that RSS value — equally unreliable
- **`audioRef.current.duration`** is the ground truth — set by the browser once the audio loads

## Pages to fix

### 1. Podcast page (`/podcast/[id]/page.tsx`) — highest priority
- `ep.duration` (RSS value) is used for:
  - `pct` calculation → drives the `EpisodeProgressOverlay` fill
  - `remaining` ("X LEFT" / "X M LEFT" label)
- **Fix**: when the episode is currently playing, read `audioRef` from `usePlayer()` and use `audioRef.current.duration` as the denominator for the playing episode's `pct` and `remaining`

### 2. Playlist page (`/playlist/[id]/page.tsx`)
- `item.episode.duration` (DB value) is the denominator for `pct`
- Same `liveDuration` state + interval pattern as the queue fix

### 3. History page (`/history/page.tsx`)
- `duration` (DB value) is the denominator for `pct` in `formatProgress()`
- Lower priority: history items are not actively playing in most cases, but the currently-playing item will show a wrong fill

## Pattern to follow (already done in queue)

```ts
// In the page component:
const [liveDuration, setLiveDuration] = useState(0)

useEffect(() => {
  if (!nowPlaying) return
  const id = setInterval(() => {
    if (audioRef.current) {
      setLivePosition(audioRef.current.currentTime)
      setLiveDuration(audioRef.current.duration || 0)
    }
  }, LIVE_POSITION_INTERVAL_MS)
  return () => clearInterval(id)
}, [nowPlaying, audioRef])

// In the row/item component:
const durSeconds = isPlaying && liveDuration > 0 ? liveDuration : (storedDuration ?? 0)
const pct = posSeconds > 0 && durSeconds > 0
  ? Math.min(100, Math.round((posSeconds / durSeconds) * 100))
  : null
```

## Longer-term option

When `audioRef.current.duration` is known and differs significantly from `episodes.duration` (>10%), write the corrected duration back via `PATCH /api/progress` so the DB value improves over time. Low priority — not needed for correct UI.
