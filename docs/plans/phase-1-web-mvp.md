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
- [x] PlayerContext (global playback state, persists to localStorage)
- [x] Discover page (search + results grid)
- [x] Podcast detail page (episode list, subscribe button, add-to-queue per episode)
- [x] Database schema with RLS policies (`supabase/migrations/`)
- [x] Git repo initialized + pushed to GitHub
- [x] Auth guard via `src/proxy.ts`, sign out handler, OAuth callback route
- [x] Save playback progress to DB every 10s (throttle), restore on episode load
- [x] Subscribe/unsubscribe to podcasts, persisted to DB, instant sidebar update
- [x] Subscribed podcasts in Sidebar with drag-to-reorder
- [x] Queue: add/remove/reorder (drag-and-drop), persisted to DB
- [x] History: in-progress and completed episodes from DB
- [x] Episode ends → marked completed, removed from queue, next queue item auto-plays
- [x] Chapter support: fetch `podcast:chapters` JSON, markers on scrubber, current chapter name
- [x] Ad banner placeholder for free-tier users (checks `user_profiles.tier`)
- [x] Loading skeletons for episode lists and search results
- [x] Error states (failed RSS fetch, no results)

---

## Remaining

### Polish
- [x] Responsive layout check — mobile padding on discover/queue/history (`p-4 md:p-8`), discover grid now `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

### Testing (backfill)
- [x] Set up Vitest + Playwright
- [x] Unit tests: RSS parser (`src/lib/rss/parser.ts`) — guid parsing, field extraction
- [x] Unit tests: iTunes search wrapper (`src/lib/itunes/search.ts`)
- [x] Playwright E2E: sign up → search → subscribe → play → queue flow

---

## Key Files

| File | Purpose |
|---|---|
| `src/app/(app)/layout.tsx` | Main app shell (sidebar + player + ad banner) |
| `src/app/(app)/discover/page.tsx` | Search + podcast grid |
| `src/app/(app)/podcast/[id]/page.tsx` | Episode list, subscribe, add to queue |
| `src/app/(app)/queue/page.tsx` | Queue with drag-to-reorder |
| `src/app/(app)/history/page.tsx` | Listening history |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/components/player/Player.tsx` | Audio player UI + progress save/restore + chapter markers |
| `src/components/player/PlayerContext.tsx` | Global playback state |
| `src/components/ui/Sidebar.tsx` | Nav + subscriptions with drag-to-reorder |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client |
| `src/lib/rss/parser.ts` | RSS feed parser |
| `src/lib/itunes/search.ts` | iTunes search wrapper |
| `src/proxy.ts` | Auth guard (Next.js 16 middleware equivalent) |
| `supabase/migrations/` | DB schema + migrations |

---

## Verification

- Sign up → redirected to `/discover`
- Search a podcast → results appear
- Click podcast → episodes load from RSS
- Click episode → player appears, audio plays, position restored from DB
- Speed control changes playback rate
- Sleep timer pauses after set time
- Subscribe → podcast appears in sidebar instantly; drag to reorder
- Add episodes to queue → drag to reorder; episode ends → next plays automatically
- History shows in-progress and completed episodes with progress %
- Chapter markers appear on scrubber for supported podcasts (e.g. "No Agenda")
- Ad banner shows for free-tier users, dismissible
