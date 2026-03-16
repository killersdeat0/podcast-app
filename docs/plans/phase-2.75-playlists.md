# Phase 2.75 — Playlists

## Goal
Let users create named, reusable playlists separate from the ephemeral queue. Playlists play sequentially like the queue, support drag-to-reorder, and can be shared via a public URL.

## Freemium Limits
- **Free:** 3 playlists max, 10 episodes per playlist
- **Paid:** unlimited
- **On downgrade:** existing data is preserved but the user can't play from or add to over-limit playlists until they delete down to within limits. Warning banner shown on `/playlists` and `/playlist/[id]`.

## Planned

### Database
- [ ] New migration: `playlists` table (`id`, `user_id`, `name`, `description`, `is_public`, `position`, `created_at`, `updated_at`)
- [ ] New migration: `playlist_episodes` table (`id`, `playlist_id`, `episode_guid`, `feed_url`, `position`, `added_at`) with unique `(playlist_id, episode_guid)`
- [ ] RLS: owner full access; authenticated users can read public playlists/episodes
- [ ] Anonymous reads for public playlists handled via `createAdminClient()` in API route (no anon RLS policy)

### API Routes (`src/app/api/playlists/`)
- [ ] `GET /api/playlists` — list user's playlists with episode counts
- [ ] `POST /api/playlists` — create; 403 if free user has ≥3 playlists
- [ ] `PATCH /api/playlists` — reorder `{ orderedIds }`
- [ ] `GET /api/playlists/[id]` — public or owned; uses `createAdminClient()` for unauthenticated callers, manually checks `is_public`; returns episodes + `playback_progress` for authed callers
- [ ] `PATCH /api/playlists/[id]` — update `name`, `description`, `isPublic`
- [ ] `DELETE /api/playlists/[id]` — delete (cascade removes episodes)
- [ ] `POST /api/playlists/[id]/episodes` — add episode; upserts `episodes` cache; 403 if free user playlist has ≥10
- [ ] `DELETE /api/playlists/[id]/episodes` — remove episode `{ guid }`
- [ ] `PATCH /api/playlists/[id]/episodes` — reorder `{ orderedGuids }` (parallel position updates, same as queue)

### Player Integration
- [ ] Extend `NowPlaying` interface with `playlistContext?: { playlistId: string; episodeGuids: string[] } | null`
- [ ] `completeAndAdvance` + `skipToNext` in `Player.tsx` branch on `playlistContext`: if present, advance through playlist guids (fetch next episode metadata from `GET /api/playlists/[id]`); playlist playback is non-destructive (doesn't remove from queue)
- [ ] `hasNextInQueue` also checks `playlistContext?.episodeGuids`
- [ ] Add `playPlaylist(playlist)` helper in `PlayerContext.tsx`

### Proxy
- [ ] Add `/playlist` to `PUBLIC_PATHS` (playlist detail page — guests can view public)
- [ ] Add `/api/playlists/` to `PUBLIC_PATHS` (trailing slash to avoid matching the auth-required list endpoint)

### Pages
- [ ] `/playlists` — index: playlist cards (name, description, episode count, public/private badge), create modal, over-limit warning for free users
- [ ] `/playlist/[id]` — detail: owner gets inline edit (name, description, public toggle), drag-to-reorder (@dnd-kit), remove buttons; everyone gets "Play Playlist" + per-episode "Add to Queue"; over-limit banner for downgraded users; "Copy link" for public playlists. Listen for `history-changed` to refresh per-episode progress indicators, and `queue-changed` to refresh in-queue state.

### Sidebar
- [ ] Add "Playlists" nav item (between Queue and History)
- [ ] Add "My Playlists" collapsible section (above "My Podcasts"): fetched on mount + on `playlists-changed` event, "+" button to create, guest hint

### i18n
- [ ] Add `playlists` namespace to `en.ts` and `es.ts` (create, edit, delete, empty states, share, over-limit warnings)
- [ ] Add `playlists` key to `nav` namespace

### Testing
- [ ] Unit tests: `playlists/route.test.ts`, `playlists/[id]/route.test.ts`, `playlists/[id]/episodes/route.test.ts`
- [ ] E2E: create playlist → add episode → play → assert audio playing
- [ ] E2E: toggle to public → open in unauthenticated context → assert visible + playable
- [ ] E2E: guest visits `/playlists` → redirected to `/login`
- [ ] E2E: guest visits `/playlist/[public-id]` → page loads (not redirected)
- [ ] E2E: free user at limit → create button disabled + warning shown

### Docs
- [ ] Create `docs/playlists.md`
- [ ] Update `docs/data-model.md` — add `playlists` and `playlist_episodes` tables
- [ ] Update `docs/api.md` — add all playlist routes
- [ ] Update `CLAUDE.md` — note `playlists-changed` event pattern

## Implementation Order
1. Migration → proxy → API routes → unit tests
2. Player integration (`NowPlaying` type + `Player.tsx` branching)
3. i18n → pages → sidebar
4. E2E tests → docs
