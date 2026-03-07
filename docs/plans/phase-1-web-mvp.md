# Phase 1 — Web MVP

## Goal
A working web app where users can sign up, search/subscribe to podcasts, play episodes, and have their progress synced across sessions.

---

## Completed

- [x] Next.js 16 + TypeScript + Tailwind scaffold
- [x] Project folder structure (`(app)`, `(auth)`, `api`, `components`, `lib`)
- [x] Supabase client/server helpers (`src/lib/supabase/`)
- [x] iTunes search API wrapper (`src/lib/itunes/search.ts`)
- [x] RSS feed parser (`src/lib/rss/parser.ts`)
- [x] API routes: `/api/podcasts/search`, `/api/podcasts/feed`
- [x] Auth pages: login + signup (email/password + Google OAuth via Supabase)
- [x] App shell: Sidebar + layout
- [x] Audio player: play/pause, seek, speed control (0.5x–3x), sleep timer
- [x] PlayerContext (global playback state)
- [x] Discover page (search + results grid)
- [x] Podcast detail page (episode list, click to play)
- [x] Queue + History pages (stubs)
- [x] Database schema with RLS policies (`supabase-schema.sql`)
- [x] Git repo initialized + pushed to GitHub

---

## Remaining

### Supabase wiring
- [ ] Middleware: protect `(app)` routes, redirect unauthenticated users to `/login`
- [ ] Sign out handler in Sidebar (currently just a link to `/login`)
- [ ] Auth callback route (`/auth/callback`) for OAuth redirect handling

### Sync
- [ ] Save playback progress to DB on `timeupdate` (debounced)
- [ ] Restore playback position when an episode loads
- [ ] Subscribe/unsubscribe to podcasts, persisted to DB
- [ ] Show subscribed podcasts in Sidebar or a "My Podcasts" section
- [ ] Queue: add episodes, persist order, reorder, remove
- [ ] History: list completed/in-progress episodes from DB

### Player
- [ ] Chapter support (parse `podcast:chapters` JSON, display chapter markers on scrubber)

### Ads
- [ ] Ad banner placeholder for free-tier users

### Polish
- [ ] Loading skeletons for episode lists and search results
- [ ] Error states (failed RSS fetch, no results)
- [ ] Responsive layout check

---

## Key Files

| File | Purpose |
|---|---|
| `src/app/(app)/layout.tsx` | Main app shell (sidebar + player) |
| `src/app/(app)/discover/page.tsx` | Search + podcast grid |
| `src/app/(app)/podcast/[id]/page.tsx` | Episode list + play |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/components/player/Player.tsx` | Audio player UI |
| `src/components/player/PlayerContext.tsx` | Global playback state |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client |
| `src/lib/rss/parser.ts` | RSS feed parser |
| `src/lib/itunes/search.ts` | iTunes search wrapper |
| `supabase-schema.sql` | Full DB schema + RLS policies |

---

## Verification

- Sign up → redirected to `/discover`
- Search a podcast → results appear
- Click podcast → episodes load from RSS
- Click episode → player appears, audio plays
- Speed control changes playback rate
- Sleep timer pauses after set time
- Play episode on one session, log in on another → position restored
- Subscribe to podcast → appears in sidebar
- Queue: add/remove/reorder persists across sessions
