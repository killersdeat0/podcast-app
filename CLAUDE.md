# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Next.js 16 + Turbopack)
npm run build     # production build
npm run lint      # ESLint
```

No test suite exists yet.

## Environment

Requires `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Architecture

**Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS v4 · Supabase (auth + database) · `fast-xml-parser` for RSS

### Route groups

- `src/app/(auth)/` — login/signup pages, no sidebar/player shell
- `src/app/(app)/` — protected app shell (sidebar + player), all main pages
- `src/app/api/` — server-side API routes (all require auth via Supabase server client)
- `src/app/auth/callback/` — OAuth redirect handler

### Auth guard

`src/proxy.ts` is the Next.js 16 equivalent of `middleware.ts`. It protects all `(app)` routes and redirects unauthenticated users to `/login`.

### Data flow

Podcast discovery uses the iTunes Search API (`/api/podcasts/search`) → episode list fetches RSS via `/api/podcasts/feed` → `fast-xml-parser` parses the feed server-side.

### Global playback state

`PlayerContext` (`src/components/player/PlayerContext.tsx`) holds `nowPlaying` in React state and persists it to `localStorage` on every `play()` call so the player survives page refreshes. The `Player` component (`src/components/player/Player.tsx`) owns the `<audio>` element, restores saved position from `/api/progress` on episode load, and saves position to `/api/progress` every 10 seconds via a throttle (not a debounce).

### Supabase clients

- `src/lib/supabase/client.ts` — browser client (for client components and sign-out)
- `src/lib/supabase/server.ts` — async server client using `cookies()` (for API routes and Server Components)

### Database

Schema lives in `supabase/migrations/20250307000000_initial_schema.sql`. Key tables: `subscriptions`, `episodes` (shared cache), `playback_progress`, `queue`. The `episodes` table is an upsert-based cache — episode metadata is written whenever progress is saved or an episode is added to the queue. Always use `{ onConflict: 'feed_url,guid' }` when upserting into `episodes`.

**Artwork URL priority:** Always prefer the iTunes CDN URL (stored in `subscriptions.artwork_url`) over RSS feed artwork URLs — many podcast sites block hotlinking. When displaying queue/history items, fall back to `subscriptions.artwork_url` if `episodes.artwork_url` is missing.

### RSS parser quirk

The `guid` field in RSS items can be an XML object `{ '#text': '...', '@_isPermaLink': 'false' }` rather than a plain string. The parser (`src/lib/rss/parser.ts`) handles this — do not simplify it back to `String(item['guid'])`.
