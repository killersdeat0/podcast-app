# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
cd web && npm run dev       # start dev server (Next.js 16 + Turbopack)
stripe listen --forward-to localhost:3000/api/stripe/webhook  # required for Stripe webhooks locally
cd web && npm run build     # production build
cd web && npm run lint      # ESLint
supabase db push            # apply pending migrations to remote DB

# Edge Functions — deploy to BOTH projects every time:
supabase functions deploy <function-name> --project-ref nuvadoybccdqipyhdhns  # dev
supabase functions deploy <function-name> --project-ref dqqybduklxwxtcahqswh  # prod
# Or without --project-ref to deploy to whichever is linked (defaults to prod)
```

## Testing

```bash
cd web && npm test -- --run   # run unit tests (Vitest, non-watch)
cd web && npm test            # run unit tests in watch mode
cd web && npm run test:e2e    # run Playwright E2E tests (requires dev server on port 3000)
```

Unit tests live alongside source files (`web/src/**/*.test.ts`). E2E tests live in `web/tests/e2e/`.

**Before committing:** always run `cd web && npm run build` (TypeScript check) and unit tests (`cd web && npm test -- --run`).

**Before committing large changes:** also run E2E tests (`cd web && npm run test:e2e`). Requires a running dev server (`cd web && npm run dev`) and `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` in `web/.env.local`. Run E2E when touching:
- Auth flow, middleware (`proxy.ts`), or redirect logic
- Player, queue, or progress saving
- API routes that the UI depends on
- Any change that spans multiple components or pages

## Environment

Requires `web/.env.local` (Next.js only reads env files from its project root):
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

# Google AdSense (optional — omit to show house upgrade CTA banner instead)
NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=   # ca-pub-XXXXXXXXXXXXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_ID=        # ad slot ID for the horizontal banner unit

```

## Mobile (Compose Multiplatform)

Project root: `/mobile/`

```bash
cd mobile && ./gradlew :composeApp:assembleDebug   # build Android APK
cd mobile && ./gradlew :composeApp:allTests         # run all tests
```

See `/mobile/CLAUDE.md` for architecture details.

## Docs

Read relevant docs before making changes. Key triggers:

- `docs/player.md` — before touching player, queue, or progress
- `docs/auth.md` — before touching `proxy.ts`, auth pages, or `auth/callback`
- `docs/data-model.md` — before touching DB schema or queries
- `docs/playlists.md` — before touching playlist routes or components
- `docs/api.md`, `docs/stripe.md`, `docs/i18n.md`, `docs/theming.md`, `docs/ui-patterns.md`, `docs/deployment.md`

## Architecture

**Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS v4 · Supabase (auth + database) · Supabase Edge Functions (RSS + search) · `@dnd-kit` for drag-and-drop · `lucide-react` for icons

### Monorepo structure

- `web/` — Next.js web app (source in `web/src/`)
- `mobile/` — Compose Multiplatform Android/iOS app
- `supabase/` — shared infra: DB migrations (`supabase/migrations/`) and Edge Functions (`supabase/functions/`)
- `packages/` — shared JS packages (future)

### Route groups

- `web/src/app/(auth)/` — login/signup pages, no sidebar/player shell
- `web/src/app/(app)/` — protected app shell (sidebar + player), all main pages
  - `/settings` — playback defaults, language, sign-out, delete account (auth-protected; guests redirected to login)
- `web/src/app/api/` — server-side API routes (all require auth via Supabase server client)
- `web/src/app/auth/callback/` — OAuth redirect handler

### Auth guard

`web/src/proxy.ts` is the Next.js 16 equivalent of `middleware.ts`. It redirects unauthenticated users to `/login` for protected routes. Public routes (defined in `PUBLIC_PATHS`) are accessible without login: `/discover`, `/podcast`, `/queue`, `/login`, `/signup`, `/auth/callback`, and read-only podcast API routes (`/api/podcasts/*`). Guests who reach public `(app)` routes get the full shell (sidebar, player) with guest-mode UI via `UserContext` — see `web/src/lib/auth/UserContext.tsx`.

- `/playlist` is in `PUBLIC_PATHS` — playlist detail page is publicly accessible (for shared public playlists).
- `/api/playlists/` (trailing slash) is in `PUBLIC_PATHS` — allows unauthenticated reads of `/api/playlists/[id]`; the trailing slash ensures `/api/playlists` (list) remains auth-protected.

### Data flow

Podcast discovery proxies through `web/src/app/api/podcasts/search` → calls `supabase/functions/podcasts-search` → iTunes Search API. Episode list fetches via `web/src/app/api/podcasts/feed` → calls `supabase/functions/podcasts-feed` → fetches and parses RSS with `fast-xml-parser`. The Edge Functions are also used directly by the mobile app.

`/api/podcasts/feed` caches responses server-side for 1 hour (shared across all users for the same feedUrl). Pass `?nocache=1` to bypass the cache — the route switches to `cache: 'no-store'` for that request. Use this pattern for any route that needs manual cache invalidation without a full revalidation strategy.

`/api/podcasts/similar` returns up to 6 similar podcasts using a multi-pass iTunes search (name+genre per genre, genre-only per genre, name-only fallback). Looks up `genreIds` via iTunes lookup cached 24hr. See `docs/api.md` for full details.

**Shared UI components:** `web/src/components/podcasts/PodcastCard.tsx` — reusable podcast card used by both the Discover page and the podcast detail page's similar podcasts section.

**Dev-only debug panels, delayed skeleton pattern:** see `docs/ui-patterns.md`.

### i18n

All user-facing strings live in `web/src/lib/i18n/`. The active locale is stored in `localStorage` and toggled from **Settings → Language**. Use `useStrings()` from `LocaleContext.tsx` in every client component — never the static `strings` export from `index.ts`. When writing or editing user-visible text, keep it fun: use emojis in titles/empty states and write CTAs as actions. See `docs/i18n.md` for the full guide.

**Pages that need both `metadata` and i18n:** `metadata` can only be exported from server components, but `useStrings()` requires a client component. Split into a server `page.tsx` (exports `metadata`, renders `<XContent />`) and a client `XContent.tsx` (has `'use client'`, calls `useStrings()`). See `web/src/app/(app)/contact/` for the pattern.

### Global playback state

`PlayerContext` (`web/src/components/player/PlayerContext.tsx`) holds `nowPlaying` in React state, restored from `localStorage` on mount via `useEffect` (not initial state — avoids SSR hydration mismatch). See `docs/player.md` for full architecture.

**Progress saves — all 4 paths must stay in sync:** switch-away save, 10s throttled save, 98% completion mark, and `completeAndAdvance` in `Player.tsx`. All must send `positionPct`. Switch-away and 10s saves must guard with `!hasCompletedRef.current`. At 98%, save `completed: true` but do NOT call `completeAndAdvance`.

**`progress-saved` event:** `{ guid, positionSeconds, positionPct, completed }`. History uses in-place updates; queue and playlist do full refetches. See `docs/player.md`.

**Progress display (queue, history, playlist, podcast episode list) must be updated together.** Priority chain: `livePct` → `position_pct` → RSS fallback. Use `useLayoutEffect` on episode change.

### Silence skipping — canceled for web, mobile only

Do not attempt browser-only silence skipping: podcast audio is cross-origin and CORS headers are absent on tracking redirects (podtrac, vpixl, etc.), so the Web Audio API graph is zeroed out. Implement in mobile Phase 3 only, where native audio APIs have no CORS restriction.

### Supabase clients

- `web/src/lib/supabase/client.ts` — browser client (for client components and sign-out)
- `web/src/lib/supabase/server.ts` — async server client using `cookies()` (for API routes and Server Components)

### Database

Schema lives in `supabase/migrations/`. Key tables: `subscriptions`, `episodes` (shared cache), `playback_progress`, `queue`. The `episodes` table is an upsert-based cache — episode metadata is written whenever progress is saved or an episode is added to the queue. Always use `{ onConflict: 'feed_url,guid' }` when upserting into `episodes`.

**Artwork URL priority:** Always prefer the iTunes CDN URL (stored in `subscriptions.artwork_url`) over RSS feed artwork URLs — many podcast sites block hotlinking. The queue and history APIs look up `subscriptions.artwork_url` as a fallback when `episodes.artwork_url` is missing.

**Subscription ordering:** `subscriptions.position` stores drag-drop order. Use `PATCH /api/subscriptions` with `{ orderedFeedUrls }` to update. Same pattern for queue: `PATCH /api/queue` with `{ orderedGuids }`.

**Per-show speed override:** `subscriptions.speed_override FLOAT NULL` — paid-only. Set via picker on the podcast detail page. `POST /api/subscriptions` PATCH Body B accepts `speedOverride` (null to clear). Player reads `localStorage` key `podcast-speed-{feedUrl}` on episode load (synced from DB on podcast page mount). See `web/src/lib/player/speed.ts` for utility functions.

**Default volume:** `user_profiles.default_volume FLOAT NULL` — synced cross-device. Settings page fetches `GET /api/profile` on mount and writes back via `PATCH /api/profile` on change. localStorage key `playback-volume` is the fast read path, DB is authoritative.

**Queue prepend:** `POST /api/queue` with `prepend: true` skips the queue-cap check, calls the `increment_queue_positions(p_user_id)` Supabase RPC (shifts all existing positions up by 1), and inserts at position 0. Used by undo-skip to restore the previous episode to the front of the queue. Guest users use `prependClient()` from `PlayerContext`.

### Sidebar subscription sync

The Sidebar fetches subscriptions on mount and re-fetches on the custom `subscriptions-changed` window event. Fire `window.dispatchEvent(new Event('subscriptions-changed'))` after any subscribe/unsubscribe to update the sidebar instantly without a page reload.

**Instant badge clear — `subscription-count-reset` event:** To clear (or update) a badge without a network round-trip, dispatch:
```ts
window.dispatchEvent(new CustomEvent('subscription-count-reset', {
  detail: { feedUrl: string, newEpisodeCount: number }
}))
```
The Sidebar updates its local `subscriptions` state in-place from the event payload — use this instead of `subscriptions-changed` when only the badge count is changing.

### Playlist sync

The Sidebar fetches playlists on mount and re-fetches on the custom `playlists-changed` window event. Fire `window.dispatchEvent(new Event('playlists-changed'))` after any playlist create, delete, or rename.

Fire `window.dispatchEvent(new CustomEvent('playlist-episodes-changed', { detail: { playlistId } }))` after any episode add, remove, or reorder within a playlist. The Player listens for this event and refreshes `playlistContext.episodes` in `nowPlaying` so the skip button and playback advance order stay current. `addEpisodeToPlaylist()` dispatches this automatically; call it manually from any other mutation site.

### Freemium limits

All freemium caps live in `web/src/lib/limits.ts` — **never hardcode limit numbers in route files or UI**. Import `LIMITS` from there.

### Admin client

`web/src/lib/supabase/admin.ts` exports `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY` (server-only — never `NEXT_PUBLIC_*`). Used **only** for serving public playlist reads to unauthenticated users in `GET /api/playlists/[id]`. For all other API routes use `createClient()` from `@/lib/supabase/server`.

### Theming and colors

Both web and mobile use **Material3** color roles as the shared design vocabulary. Source color: `#7c3aed` (violet-600). The goal is full portability: change a single `--md-*` variable and both platforms update.

**Web:** All colors are defined as `--md-*` CSS custom properties in `web/src/app/globals.css` and exposed as Tailwind utilities via `@theme inline`. **Always use semantic tokens — never raw Tailwind palette classes** (no `bg-gray-*`, `text-violet-*`, `text-white`, `bg-black/60`, etc.). This includes opacity modifiers on semantic tokens — `bg-primary/10` is banned for the same reason as `bg-black/60`; use a defined token like `bg-primary-container` instead. To add a new color: define `--md-*` in `:root` and expose it as `--color-*` in `@theme inline`; never hardcode hex or rgba values in components.

**Mobile:** `SyncPodsTheme` in `mobile/.../theme/Theme.kt` wraps `MaterialTheme` with a custom `darkColorScheme`. All Composables use `MaterialTheme.colorScheme.*` — never hardcoded hex values.

See `docs/theming.md` for the full token table and light-theme migration notes.

### Modals and toasts

Use `@radix-ui/react-dialog` for all modals — no custom backdrop/escape patterns. Use **sonner** via `<AppToasts />` in the app shell — no standalone toast components. See `docs/ui-patterns.md` for patterns and the blocking-modal (`dismissable={false}`) usage.

### Rendering HTML from RSS feeds

Podcast/episode descriptions from RSS feeds may contain HTML (from CDATA sections). Always sanitize before rendering: use `DOMPurify.sanitize()` with `dangerouslySetInnerHTML`. Never render raw RSS HTML without sanitization. Apply Tailwind child selectors (`[&_a]:`, `[&_p]:`, etc.) on the container to style the rendered HTML using semantic tokens.

```tsx
<div
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description) }}
  className="[&_a]:text-primary [&_a]:underline [&_p]:mb-2"
/>
```

### Ownership verification

Mutating playlist API routes (`PATCH`/`DELETE` on `/api/playlists/[id]`) fold `.eq('user_id', user.id)` into the Supabase query and return `404` when no rows are matched — this avoids leaking whether a private playlist ID exists. Episode sub-routes (`/api/playlists/[id]/episodes`) do a pre-flight `playlists` query with both `.eq('id', id).eq('user_id', user.id)` and return `404` on no match.

### Documentation

When asked to commit or making a plan, first check if the change introduces a new pattern, alters existing behavior, or changes an API route (parameters, return shape, or side effects). ALWAYS tell me: update `CLAUDE.md`, and create or update a focused doc file in `docs/` covering the changed area (e.g. `docs/api.md`, `docs/player.md`). Phase plan files in `docs/plans/` should also be updated if a planned item is completed or changed in scope.

