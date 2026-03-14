# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Next.js 16 + Turbopack)
npm run build     # production build
npm run lint      # ESLint
supabase db push  # apply pending migrations to remote DB
```

## Testing

```bash
npm test -- --run   # run unit tests (Vitest, non-watch)
npm test            # run unit tests in watch mode
npm run test:e2e    # run Playwright E2E tests (requires dev server on port 3000)
```

Unit tests live alongside source files (`*.test.ts`). E2E tests live in `tests/e2e/`.

## Environment

Requires `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Stripe (required for subscription payments)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_MONTHLY_PRICE_ID=
STRIPE_YEARLY_PRICE_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID=
NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID=
```

## Docs

Read relevant docs before making changes

- `docs/api.md` — all API routes, request/response shapes, freemium gates. Read before touching API routes.
- `docs/data-model.md` — DB tables, columns, RLS policies, key patterns. Read before touching DB schema or queries.
- `docs/player.md` — player state machine, progress saving, queue auto-advance, chapters. Read before touching player/queue logic.
- `docs/i18n.md` — i18n system: adding languages, string namespaces, EmptyState component, tone guidelines. Read before adding any user-visible text.

## Architecture

**Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS v4 · Supabase (auth + database) · `fast-xml-parser` for RSS · `@dnd-kit` for drag-and-drop

### Route groups

- `src/app/(auth)/` — login/signup pages, no sidebar/player shell
- `src/app/(app)/` — protected app shell (sidebar + player), all main pages
- `src/app/api/` — server-side API routes (all require auth via Supabase server client)
- `src/app/auth/callback/` — OAuth redirect handler

### Auth guard

`src/proxy.ts` is the Next.js 16 equivalent of `middleware.ts`. It protects all `(app)` routes and redirects unauthenticated users to `/login`.

### Data flow

Podcast discovery uses the iTunes Search API (`/api/podcasts/search`) → episode list fetches RSS via `/api/podcasts/feed` → `fast-xml-parser` parses the feed server-side.

### i18n

All user-facing strings live in `src/lib/i18n/`. The active locale is stored in `localStorage` and toggled from **Profile → Language**. Use `useStrings()` from `LocaleContext.tsx` in every client component — never the static `strings` export from `index.ts`. When writing or editing user-visible text, keep it fun: use emojis in titles/empty states and write CTAs as actions. See `docs/i18n.md` for the full guide.

### Global playback state

`PlayerContext` (`src/components/player/PlayerContext.tsx`) holds `nowPlaying` in React state. On mount it restores `nowPlaying` from `localStorage` via `useEffect` (not initial state — avoids SSR hydration mismatch). The `play()` call persists to `localStorage`.

The `Player` component (`src/components/player/Player.tsx`) always renders the `<audio>` element (even when `nowPlaying` is null) so that event listeners attach on mount. The UI is conditionally shown. It restores saved position from `/api/progress` on episode load (only auto-plays if `playing` is true), saves position to `/api/progress` every 10 seconds via throttle, and on `ended` marks the episode complete, removes it from the queue, and auto-plays the next queue item.

### Silence skipping — web blocked, canceled for web, mobile only

`useSilenceSkipper` (`src/hooks/useSilenceSkipper.ts`) uses the Web Audio API (`createMediaElementSource` + `AnalyserNode`) to detect and skip silent sections. **This does not work on the web** because all podcast audio is cross-origin and the tracking redirect chain (podtrac, vpixl, etc.) doesn't send CORS headers — the browser zeroes out the entire audio graph. A CORS proxy (Cloudflare Worker) would fix it but isn't worth the complexity yet. The feature is canceled for web; will be implemented in Phase 3 (mobile), where native audio APIs have no CORS restriction. Do not re-attempt a browser-only fix without a proxy.

### Supabase clients

- `src/lib/supabase/client.ts` — browser client (for client components and sign-out)
- `src/lib/supabase/server.ts` — async server client using `cookies()` (for API routes and Server Components)

### Database

Schema lives in `supabase/migrations/`. Key tables: `subscriptions`, `episodes` (shared cache), `playback_progress`, `queue`. The `episodes` table is an upsert-based cache — episode metadata is written whenever progress is saved or an episode is added to the queue. Always use `{ onConflict: 'feed_url,guid' }` when upserting into `episodes`.

**Artwork URL priority:** Always prefer the iTunes CDN URL (stored in `subscriptions.artwork_url`) over RSS feed artwork URLs — many podcast sites block hotlinking. The queue and history APIs look up `subscriptions.artwork_url` as a fallback when `episodes.artwork_url` is missing.

**Subscription ordering:** `subscriptions.position` stores drag-drop order. Use `PATCH /api/subscriptions` with `{ orderedFeedUrls }` to update. Same pattern for queue: `PATCH /api/queue` with `{ orderedGuids }`.

### Sidebar subscription sync

The Sidebar fetches subscriptions on mount and re-fetches on the custom `subscriptions-changed` window event. Fire `window.dispatchEvent(new Event('subscriptions-changed'))` after any subscribe/unsubscribe to update the sidebar instantly without a page reload.

### Documentation

When committing, first check if it significantly altering a function or API route (changing behavior, parameters, return shape, or side effects). update `CLAUDE.md` if the change affects anything documented there, and create or update a focused doc file in `docs/` covering the changed area (e.g. `docs/api.md`, `docs/player.md`). Phase plan files in `docs/plans/` should also be updated if a planned item is completed or changed in scope.

### RSS parser quirk

The `guid` field in RSS items can be an XML object `{ '#text': '...', '@_isPermaLink': 'false' }` rather than a plain string. The parser (`src/lib/rss/parser.ts`) handles this — do not simplify it back to `String(item['guid'])`.
