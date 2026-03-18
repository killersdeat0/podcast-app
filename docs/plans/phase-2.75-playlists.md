# Phase 2.75 — Playlists

## Goal
Let users create named, reusable playlists separate from the ephemeral queue. Playlists play sequentially like the queue, support drag-to-reorder, and can be shared via a public URL.

## Freemium Limits
- **Free:** 3 playlists max, 10 episodes per playlist
- **Paid:** unlimited
- **On downgrade:** existing data is preserved but the user can't play from or add to over-limit playlists until they delete down to within limits. Warning banner shown on `/playlists` and `/playlist/[id]`.

## Key Decisions
- **Player advance:** store the full episode list in `NowPlaying.playlistContext` at play time (no extra API call per advance; stale-until-restart is acceptable UX)
- **"Add to Playlist"** entry point: podcast page (popover), queue page, history page, now-playing bar
- **Anonymous reads:** no anon RLS policy — API route uses `createAdminClient()` + manual `is_public` check

## Planned

### Database
- [x] New migration: `playlists` table (`id`, `user_id`, `name`, `description`, `is_public`, `position`, `created_at`, `updated_at`) + `updated_at` trigger
- [x] New migration: `playlist_episodes` table (`id`, `playlist_id`, `episode_guid`, `feed_url`, `position`, `added_at`) with unique `(playlist_id, episode_guid)`
- [x] RLS: owner full access; authenticated users can read public playlists/episodes; **no anon policy**
- [x] Anonymous reads for public playlists handled via `createAdminClient()` in API route (no anon RLS policy)
- [x] New file: `web/src/lib/supabase/admin.ts` — service-role client (never `NEXT_PUBLIC_*`) — already existed
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY=` to `web/.env.local`
- [x] Shared helper: `web/src/lib/playlists/verifyOwnership.ts`

### API Routes (`src/app/api/playlists/`)
- [x] `GET /api/playlists` — list user's playlists with episode counts
- [x] `POST /api/playlists` — create; 403 if free user has ≥3 playlists; returns `{ ok: true, playlist }`
- [x] `PATCH /api/playlists` — reorder `{ orderedIds }` (parallel position updates)
- [x] `GET /api/playlists/[id]` — public or owned; uses `createAdminClient()` for unauthenticated callers, manually checks `is_public`; returns episodes + `playback_progress` + `isOwner` for authed callers
- [x] `PATCH /api/playlists/[id]` — update `name`, `description`, `isPublic`; sets `updated_at`
- [x] `DELETE /api/playlists/[id]` — delete (cascade removes episodes)
- [x] `POST /api/playlists/[id]/episodes` — add episode; upserts `episodes` cache (subscription artwork priority, same as queue route); 403 if free user playlist has ≥10
- [x] `DELETE /api/playlists/[id]/episodes` — remove episode `{ guid }`
- [x] `PATCH /api/playlists/[id]/episodes` — reorder `{ orderedGuids }` (parallel position updates, same as queue)

### Player Integration
- [x] Add `PlaylistEpisodeRef` interface and extend `NowPlaying` with `playlistContext?: { playlistId: string; episodes: PlaylistEpisodeRef[] } | null` — persisted automatically via existing `localStorage` in `play()`
- [x] `completeAndAdvance` + `skipToNext` in `Player.tsx` branch on `playlistContext`: if present, advance through `playlistContext.episodes` (non-destructive — does NOT touch queue); otherwise existing queue logic unchanged
- [x] On natural completion via playlist, fire-and-forget DELETE the episode from the queue so it doesn't replay later; manual skip does not dequeue
- [x] `hasNextInQueue` checks `playlistContext?.episodes` first, then falls back to `dbQueue`
- [x] Add `playPlaylist(playlistId, episodes, startIndex?)` helper in `PlayerContext.tsx`
- [x] On each advance (`skipToNext` / `completeAndAdvance`), fetch fresh order from `GET /api/playlists/[id]` instead of using the stale snapshot — reordering mid-playback takes effect immediately
- [x] Add `updatePlaylistEpisodes(episodes)` to `PlayerContext` — patches `playlistContext.episodes` in `nowPlaying` (+ localStorage) without interrupting playback
- [x] Dispatch `playlist-episodes-changed` (CustomEvent `{ playlistId }`) from `addEpisodeToPlaylist()`, `handleRemoveEpisode`, and `handleDragEnd`; Player listens and calls `updatePlaylistEpisodes` so the skip button appears/disappears live when episodes are added, removed, or reordered while playing

### Proxy
- [x] Add `/playlist` to `PUBLIC_PATHS` (playlist detail page — guests can view public)
- [x] Add `/api/playlists/` to `PUBLIC_PATHS` (trailing slash — avoids matching the auth-required `/api/playlists` list endpoint; verify: `'/api/playlists'.startsWith('/api/playlists/')` === `false`)

### Pages
- [x] `/playlists` — index: playlist cards (name, description, episode count, public/private badge), create modal, over-limit warning + disabled create button for free users at limit (`tier === 'free' && playlists.length >= 3`); guest: EmptyState with sign-in link only
- [x] `/playlist/[id]` — detail: owner gets inline edit (name, description, public toggle), drag-to-reorder (@dnd-kit), remove buttons; everyone gets "Play Playlist" + per-episode "Add to Queue"; over-limit banner for downgraded users (`tier === 'free' && episodes.length > 10`); "Copy link" for public playlists. Listen for `history-changed` (re-fetch playlist) and `queue-changed` (refresh `queuedGuids` Set).

### "Add to Playlist" Popover
- [x] `web/src/app/(app)/podcast/[id]/page.tsx` — add `ListPlus` icon button per episode row (alongside existing queue toggle); clicking opens inline popover (`fixed inset-0 z-10` backdrop + `absolute` menu) listing the user's playlists; use `useEscapeKey` hook for dismiss; state: `addToPlaylistPopover: string | null` (episode guid)
- [x] Same popover pattern on queue page and history page episode rows
- [x] Fetch `GET /api/playlists` on mount for authenticated non-guest users; refresh on `playlists-changed`

### Sidebar
- [x] Add "Playlists" nav item (between Queue and History) using `ListMusic` lucide icon; guest: auth prompt modal
- [x] Add "My Playlists" collapsible section (above "My Podcasts"): separate `useEffect` fetching on mount + `playlists-changed` event; "+" button navigates to `/playlists`; playlist name links with active-route highlight; guest hint text; collapsed mode: section omitted

### i18n
- [x] Add `playlists` namespace to `en.ts` and `es.ts` — keys: `heading, create, create_modal_title, create_name_placeholder, create_description_placeholder, create_submit, empty_title, empty_description, empty_cta, play, add_to_queue, add_to_playlist, copy_link, link_copied, public_badge, private_badge, make_public, make_private, delete, delete_confirm, delete_confirm_cta, remove_episode, episode_count, over_limit_playlists, over_limit_episodes, upgrade_cta, limit_reached_playlists, limit_reached_episodes, sidebar_heading, sidebar_empty_hint, guest_hint, auth_prompt_title`
- [x] Add `playlists` key to `nav` namespace
- [x] Both files must be updated together (`es.ts` is `satisfies Record<Locale, typeof en>` — missing keys are a compile error)

### Testing
- [x] Unit tests: `playlists/route.test.ts`, `playlists/[id]/route.test.ts`, `playlists/[id]/episodes/route.test.ts` — mirror `queue/route.test.ts` mock pattern; add `vi.mock('@/lib/supabase/admin', ...)` for admin client tests
- [ ] E2E: create playlist → add episode → play → assert audio playing
- [ ] E2E: toggle to public → open in unauthenticated context → assert visible + playable
- [ ] E2E: guest visits `/playlists` → redirected to `/login`
- [ ] E2E: guest visits `/playlist/[public-id]` → page loads (not redirected); requires `E2E_PUBLIC_PLAYLIST_ID` env var
- [ ] E2E: free user at limit → create button disabled + warning shown

### Docs
- [x] Create `docs/playlists.md` — data model, API routes, freemium gates, player integration, public sharing, over-limit behavior
- [x] Update `docs/data-model.md` — add `playlists` and `playlist_episodes` tables
- [x] Update `docs/api.md` — add all playlist routes with request/response shapes
- [x] Update `CLAUDE.md` — note `playlists-changed` event, `createAdminClient()` pattern, `playlistContext` on `NowPlaying`, `playPlaylist()` helper, `/playlist` + `/api/playlists/` as PUBLIC_PATHS

## Manual QA Checklist

### Core CRUD
- [x] Create a playlist — name + description appear on the `/playlists` index card
- [x] Create a second and third playlist — all three show in the sidebar "My Playlists" section
- [x] Click a playlist name in the sidebar — navigates to `/playlist/[id]`
- [x] Click the playlist name on the detail page — inline edit activates; save updates the heading and fires `playlists-changed`
- [x] Delete a playlist from the index page — card disappears

### Adding episodes
- [x] On a podcast page, hover an episode row — "Add to Playlist" (`ListPlus`) icon appears alongside the queue toggle
- [x] Click it — popover lists your playlists; select one — episode appears in `/playlist/[id]`
- [x] Same flow from the Queue page and History page
- [x] Add the same episode twice to the same playlist — only one copy appears (upsert)

### Playback
- [x] On `/playlist/[id]`, click "Play Playlist" — first episode starts in the player
- [x] Let it finish (or scrub to end) — advances to the second episode automatically; queue is untouched
- [x] Click an episode row directly — playback starts from that episode, continues through the rest of the playlist
- [x] Skip forward button in the player — jumps to next episode within the playlist (not queue)
- [x] While playing a playlist, check the queue page — queue is unchanged

### Reorder & remove (owner)
- [x] Drag episodes to reorder on `/playlist/[id]` — order persists after page refresh
- [x] Reorder episodes while a playlist is playing — subsequent advance (skip or auto-complete) respects the new order; skip button appears immediately if the current episode is no longer last
- [x] Click the remove button on an episode — it disappears immediately

### Public sharing
- [x] On `/playlist/[id]`, click "Make public" — badge changes to Public; "Copy link" button appears
- [x] Click "Copy link" — URL is copied; button shows "Link copied! ✓" briefly
- [x] Open the copied URL in an incognito window — blocking login modal shown; no guest access
- [x] Click "Make private" — go back to incognito, reload the URL → blocking login modal (no 404 leak)

### Guest behaviour
- [x] Visit `/playlists` as a guest — see sign-in EmptyState only, no create button *(note: CTA currently links back to same page — known bug)*
- [x] Click "Playlists" in the sidebar as a guest — auth prompt modal appears

### Freemium limits (free tier)
- [x] Create 3 playlists — create button becomes disabled; over-limit warning appears
- [x] Try creating a 4th via the form anyway (if possible) — `403` returned, error shown
- [x] Add 10 episodes to a playlist — 11th add attempt shows a toast error; green checkmark does not appear
- [x] Downgrade account (dev button on Profile), then visit a playlist with >10 episodes — over-limit banner appears; existing episodes still visible (requires page refresh after dev downgrade, now fixed via `router.refresh()`)

## Deferred / Next Session

### Must fix before shipping
- [x] **Empty state CTA dead link** — Added inline "Create playlist" button to the empty state in `/playlists` that opens the create modal directly.

- [x] **`verifyOwnership` 403 vs 404 leak** — Removed `verifyPlaylistOwnership` helper. `PATCH`/`DELETE /api/playlists/[id]` now fold `.eq('user_id', user.id)` into the query and return 404 on 0 rows. Episode sub-routes do a pre-flight `playlists` ownership query returning 404. All "not owner" unit tests updated to expect 404.

- [ ] **Deploy migrations** — `supabase db push` needed to apply the 3 new migrations (`20260315000002_playlists.sql`, `20260315000003_playlist_episodes.sql`, `20260316000000_playlists_anon_rls.sql`).

### Nice to have
- [ ] **localStorage size for large playlists** — `playlistContext` (full episode list) is written to `localStorage` on every `play()` call. Free users are capped at 10 episodes so it's fine. Paid users with very large playlists could eventually hit the ~5MB localStorage ceiling. Consider storing only `{ playlistId, currentIndex }` and re-fetching the episode list on mount instead.

- [ ] **No feedback when "Add to Queue" fails** — `handleAddToQueue` in `/playlist/[id]` silently swallows a `403` when the queue is full. The queue page shows an upgrade modal for this — playlist page should too.

- [ ] **Re-adding an existing episode to a full free-tier playlist returns 403** — The episode count check fires before the upsert, so trying to re-add an already-present episode hits the limit incorrectly. Fix: check `count` after filtering out the episode being upserted (or just skip the count check if the episode already exists).

### E2E tests (deferred)
- [ ] Create playlist → add episode → play → assert audio playing
- [ ] Toggle to public → open in unauthenticated context → assert visible + playable
- [ ] Guest visits `/playlists` → redirected to `/login`
- [ ] Guest visits `/playlist/[public-id]` → page loads (not redirected); requires `E2E_PUBLIC_PLAYLIST_ID` env var
- [ ] Free user at limit → create button disabled + warning shown

## Implementation Order
1. Migration + admin client → proxy → API routes → unit tests ✅
2. Player integration (`NowPlaying` type extension + `Player.tsx` branching + `playPlaylist()`) ✅
3. i18n → pages → "Add to Playlist" popover → sidebar ✅
4. E2E tests → docs ✅ (unit tests done; E2E deferred)
5. Switch public playlist reads to anon RLS policy (remove `createAdminClient()` + trailing-slash proxy trick) ✅
