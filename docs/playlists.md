# Playlists

Named, reusable episode lists. Unlike the ephemeral queue, playlists persist and can be shared publicly.

## Data Model

### `playlists` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `name` | text | required |
| `description` | text | optional |
| `is_public` | boolean | default false |
| `position` | integer | drag-drop order |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-updated via trigger |

### `playlist_episodes` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `playlist_id` | uuid | FK → playlists (cascade delete) |
| `episode_guid` | text | |
| `feed_url` | text | |
| `position` | integer | episode order within playlist |
| `added_at` | timestamptz | |

Unique constraint: `(playlist_id, episode_guid)`.

## Freemium Limits

| Tier | Playlists | Episodes per playlist |
|------|-----------|----------------------|
| Free | 3 | 10 |
| Paid | 1,000 | 500 |

All limits are defined in `web/src/lib/limits.ts` — the single source of truth for all freemium caps.

On downgrade: existing data is preserved. Users cannot play from or add to over-limit playlists until they delete down to within limits. Warning banners are shown on `/playlists` and `/playlist/[id]`.

## RLS Policies

- **Playlists:** Owner has full access. Authenticated users can read `is_public = true` playlists.
- **Playlist episodes:** Owner can manage (via parent playlist ownership). Authenticated users can read episodes of public playlists.
- **No anonymous policy.** Public playlist reads by unauthenticated users go through `createAdminClient()` in the API route, which manually checks `is_public`.

## Admin Client for Public Reads

`web/src/lib/supabase/admin.ts` exports `createAdminClient()` using the service-role key (`SUPABASE_SERVICE_ROLE_KEY`). This bypasses RLS and is used **only** in `GET /api/playlists/[id]` to serve unauthenticated requests for public playlists. Never use it in client components or expose the key via `NEXT_PUBLIC_*`.

## API Routes

See `docs/api.md` for full request/response shapes.

### Collection
- `GET /api/playlists` — list user's playlists (auth required)
- `POST /api/playlists` — create playlist (auth required; free tier capped at 3)
- `PATCH /api/playlists` — reorder `{ orderedIds }` (auth required)

### Single playlist
- `GET /api/playlists/[id]` — get playlist + episodes (public playlists accessible without auth)
- `PATCH /api/playlists/[id]` — update name/description/isPublic (owner only)
- `DELETE /api/playlists/[id]` — delete (owner only; cascade removes episodes)

### Episodes
- `POST /api/playlists/[id]/episodes` — add episode (owner only; free tier capped at 10)
- `DELETE /api/playlists/[id]/episodes` — remove episode `{ guid }` (owner only)
- `PATCH /api/playlists/[id]/episodes` — reorder `{ orderedGuids }` (owner only)

## Player Integration

### `playlistContext` on `NowPlaying`

```typescript
interface PlaylistEpisodeRef {
  guid: string; feedUrl: string; title: string; podcastTitle: string
  artworkUrl: string; audioUrl: string; duration: number
}

// NowPlaying (extended)
playlistContext?: { playlistId: string; episodes: PlaylistEpisodeRef[] } | null
```

When `playlistContext` is set, `Player.tsx` advances through the playlist non-destructively — it does **not** touch the queue. On each advance (skip or auto-complete), the Player fetches fresh order from `GET /api/playlists/[id]` so reordering mid-playback takes effect immediately. **Exception:** on natural completion (`completeAndAdvance`), the finished episode is also removed from the queue (fire-and-forget DELETE) so it doesn't replay when the user returns to queue mode. Manual skip does not dequeue. The context is persisted in `localStorage` via the existing `play()` call.

### `playPlaylist(playlistId, episodes, startIndex?)`

Helper in `PlayerContext.tsx`. Call this from playlist pages to start playback:

```typescript
const { playPlaylist } = usePlayer()
playPlaylist(playlistId, episodeRefs, 0) // start from first episode
playPlaylist(playlistId, episodeRefs, 3) // start from 4th episode
```

### `updatePlaylistEpisodes(episodes)`

Patches `nowPlaying.playlistContext.episodes` in place (and in `localStorage`) without interrupting the current episode. Used by the Player's `playlist-episodes-changed` listener to keep the skip button accurate when episodes are added, removed, or reordered while playback is active.

## Public Sharing

Public playlists are viewable at `/playlist/[id]` by anyone including unauthenticated users. The proxy (`web/src/proxy.ts`) includes `/playlist` in `PUBLIC_PATHS`.

The "Copy link" button copies `window.location.origin + /playlist/${id}`.

### Guest access to shared playlists

When a guest (unauthenticated user) lands on `/playlist/[id]`, a **blocking login modal** appears immediately — `AuthPromptModal` with `dismissable={false}`. There is no "Maybe later" option; the only actions are "Sign in" and "Create account", both with `returnTo` set to the current URL so the user returns after authenticating.

This modal fires in two cases:
- The API returns the playlist (public playlist) — content is rendered behind the modal but inaccessible.
- The API returns 404 (private playlist or non-existent) — blank content with the modal only, so the guest cannot determine whether the playlist exists.

`AuthPromptModal` accepts a `dismissable?: boolean` prop (default `true`). When `false`, `onOpenChange` is a no-op and the cancel button is hidden.

## Events

- `playlists-changed` — dispatched after create, delete, or rename. Sidebar and any page with a playlist list listens for this.
- `playlist-episodes-changed` (CustomEvent `{ detail: { playlistId } }`) — dispatched after any episode add, remove, or reorder within a playlist. The Player listens and refreshes `playlistContext.episodes` so the skip button and advance order stay current. `addEpisodeToPlaylist()` dispatches this automatically; fire it manually from any other mutation site.
- `queue-changed` — dispatched after "Add to Queue" from a playlist page.

## Ownership Verification

`web/src/lib/playlists/verifyOwnership.ts` exports `verifyPlaylistOwnership(playlistId, userId)`. All mutating playlist API routes call this before proceeding.

## "Add to Playlist" Entry Points

- Podcast page: `ListPlus` icon button per episode row (alongside queue toggle)
- Queue page: per-episode `ListPlus` button
- History page: per-episode `ListPlus` button
- Playlist detail page: play + add-to-queue per episode
