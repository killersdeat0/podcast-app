# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
cd web && npm run dev       # start dev server (Next.js 16 + Turbopack)
stripe listen --forward-to localhost:3000/api/stripe/webhook  # required for Stripe webhooks locally
cd web && npm run build     # production build
cd web && npm run lint      # ESLint
supabase db push            # apply pending migrations to remote DB
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
```

## Mobile (Compose Multiplatform)

Project root: `/mobile/`

```bash
cd mobile && ./gradlew :composeApp:assembleDebug   # build Android APK
cd mobile && ./gradlew :composeApp:allTests         # run all tests
```

See `/mobile/CLAUDE.md` for architecture details.

## Docs

Read any relevant docs before making changes

- `docs/api.md` — all API routes, request/response shapes, freemium gates. Read before touching API routes.
- `docs/stripe.md` — Stripe checkout flow, webhook events, user lookup logic, local dev setup. Read before touching anything in `web/src/app/api/stripe/`.
- `docs/data-model.md` — DB tables, columns, RLS policies, key patterns. Read before touching DB schema or queries.
- `docs/player.md` — player state machine, progress saving, queue auto-advance, chapters. Read before touching player/queue logic.
- `docs/i18n.md` — i18n system: adding languages, string namespaces, EmptyState component, tone guidelines. Read before adding any user-visible text.
- `docs/theming.md` — Material3 color token system (web CSS variables + Tailwind utilities, mobile ColorScheme). Read before adding colors to any component.
- `docs/deployment.md` — Vercel setup, root directory config, preview deployments. Read before touching deployment config.
- `docs/playlists.md` — playlist data model, freemium limits, RLS, player integration, public sharing. Read before touching playlist routes or components.

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

**Dev-only debug panels:** API routes can return an additional `debug` object when `process.env.NODE_ENV === 'development'`. The client checks `process.env.NODE_ENV === 'development'` and renders a collapsible `<details>` panel with `JSON.stringify(debug)`. Never include `debug` in production responses.

### i18n

All user-facing strings live in `web/src/lib/i18n/`. The active locale is stored in `localStorage` and toggled from **Profile → Language**. Use `useStrings()` from `LocaleContext.tsx` in every client component — never the static `strings` export from `index.ts`. When writing or editing user-visible text, keep it fun: use emojis in titles/empty states and write CTAs as actions. See `docs/i18n.md` for the full guide.

### Global playback state

`PlayerContext` (`web/src/components/player/PlayerContext.tsx`) holds `nowPlaying` in React state. On mount it restores `nowPlaying` from `localStorage` via `useEffect` (not initial state — avoids SSR hydration mismatch). The `play()` call persists to `localStorage`.

The `Player` component (`web/src/components/player/Player.tsx`) always renders the `<audio>` element (even when `nowPlaying` is null) so that event listeners attach on mount. The UI is conditionally shown. It restores saved position from `/api/progress` on episode load (only auto-plays if `playing` is true), saves position to `/api/progress` every 10 seconds via throttle, and on `ended` marks the episode complete, removes it from the queue, and auto-plays the next queue item.

**Progress save paths — all must stay in sync:** There are 4 places in `Player.tsx` that call `POST /api/progress`: switch-away save, 10s throttled save, 98% completion mark, and `completeAndAdvance`. All must send `positionPct` (computed from `audio.currentTime / audio.duration`). Switch-away and 10s saves must guard with `!hasCompletedRef.current`. At 98% (`onTime`), save `completed: true` but do NOT call `completeAndAdvance` — playback continues and auto-advance only fires on `ended`. Seeking back below 98% resets `hasCompletedRef` to false so the 10s save can write `completed: false`. See `docs/player.md` for full details.

**`progress-saved` event carries a detail payload:** `window.dispatchEvent(new CustomEvent('progress-saved', { detail: { guid, positionSeconds, positionPct, completed } }))`. History does in-place position updates from this payload (no refetch) to avoid overwriting optimistic ordering — only falls back to a full refetch when the episode isn't in the list yet. Queue and playlist still do full refetches (safe — their ordering is by a static position column).

**Progress display pages — queue, history, and playlist must be updated together** when changing how progress is fetched or displayed. All three use the same priority chain: `livePct` (from live audio while playing) → `position_pct` (stored in DB, accurate) → RSS-math fallback (inaccurate for ad-heavy podcasts). The podcast page episode list also shows progress. Live position state resets via `useLayoutEffect` (not `useEffect`) on episode change to prevent the previous episode's position showing on the newly-playing row before the browser paints.

### Silence skipping — canceled for web, mobile only

Do not attempt browser-only silence skipping: podcast audio is cross-origin and CORS headers are absent on tracking redirects (podtrac, vpixl, etc.), so the Web Audio API graph is zeroed out. Implement in mobile Phase 3 only, where native audio APIs have no CORS restriction.

### Supabase clients

- `web/src/lib/supabase/client.ts` — browser client (for client components and sign-out)
- `web/src/lib/supabase/server.ts` — async server client using `cookies()` (for API routes and Server Components)

### Database

Schema lives in `supabase/migrations/`. Key tables: `subscriptions`, `episodes` (shared cache), `playback_progress`, `queue`. The `episodes` table is an upsert-based cache — episode metadata is written whenever progress is saved or an episode is added to the queue. Always use `{ onConflict: 'feed_url,guid' }` when upserting into `episodes`.

**Artwork URL priority:** Always prefer the iTunes CDN URL (stored in `subscriptions.artwork_url`) over RSS feed artwork URLs — many podcast sites block hotlinking. The queue and history APIs look up `subscriptions.artwork_url` as a fallback when `episodes.artwork_url` is missing.

**Subscription ordering:** `subscriptions.position` stores drag-drop order. Use `PATCH /api/subscriptions` with `{ orderedFeedUrls }` to update. Same pattern for queue: `PATCH /api/queue` with `{ orderedGuids }`.

### Sidebar subscription sync

The Sidebar fetches subscriptions on mount and re-fetches on the custom `subscriptions-changed` window event. Fire `window.dispatchEvent(new Event('subscriptions-changed'))` after any subscribe/unsubscribe to update the sidebar instantly without a page reload.

### Playlist sync

The Sidebar fetches playlists on mount and re-fetches on the custom `playlists-changed` window event. Fire `window.dispatchEvent(new Event('playlists-changed'))` after any playlist create, delete, or rename.

Fire `window.dispatchEvent(new CustomEvent('playlist-episodes-changed', { detail: { playlistId } }))` after any episode add, remove, or reorder within a playlist. The Player listens for this event and refreshes `playlistContext.episodes` in `nowPlaying` so the skip button and playback advance order stay current. `addEpisodeToPlaylist()` dispatches this automatically; call it manually from any other mutation site.

### Freemium limits

All freemium caps live in `web/src/lib/limits.ts` — **never hardcode limit numbers in route files or UI**. Import `LIMITS` from there.

### Admin client

`web/src/lib/supabase/admin.ts` exports `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY` (server-only — never `NEXT_PUBLIC_*`). Used **only** for serving public playlist reads to unauthenticated users in `GET /api/playlists/[id]`. For all other API routes use `createClient()` from `@/lib/supabase/server`.

### Playlist player integration

`NowPlaying` (in `PlayerContext.tsx`) has an optional `playlistContext?: { playlistId: string; episodes: PlaylistEpisodeRef[] } | null`. When set, `Player.tsx` advances through playlist episodes non-destructively — does not touch the queue. The context is persisted automatically via the existing `play()` localStorage write.

Use `playPlaylist(playlistId, episodes, startIndex?)` from `usePlayer()` to start playlist playback. It wraps `play()` with the correct `playlistContext`.

### Theming and colors

Both web and mobile use **Material3** color roles as the shared design vocabulary. Source color: `#7c3aed` (violet-600). The goal is full portability: change a single `--md-*` variable and both platforms update.

**Web:** All colors are defined as `--md-*` CSS custom properties in `web/src/app/globals.css` and exposed as Tailwind utilities via `@theme inline`. **Always use semantic tokens — never raw Tailwind palette classes** (no `bg-gray-*`, `text-violet-*`, `text-white`, `bg-black/60`, etc.). To add a new color: define `--md-*` in `:root` and expose it as `--color-*` in `@theme inline`; never hardcode hex or rgba values in components.

**Mobile:** `SyncPodsTheme` in `mobile/.../theme/Theme.kt` wraps `MaterialTheme` with a custom `darkColorScheme`. All Composables use `MaterialTheme.colorScheme.*` — never hardcoded hex values.

See `docs/theming.md` for the full token table and light-theme migration notes.

### Modals and toasts

All modal dialogs use `@radix-ui/react-dialog` (`import * as Dialog from '@radix-ui/react-dialog'`). Do not use custom backdrop + `useEscapeKey` patterns for new modals — Radix Dialog provides focus trap, escape handling, and accessible close for free. Pattern: `<Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>` with `<Dialog.Portal>`, `<Dialog.Overlay>`, and `<Dialog.Content>`.

**Blocking (non-dismissable) modals:** `AuthPromptModal` accepts `dismissable={false}` to prevent closing — `onOpenChange` becomes a no-op and the "Maybe later" cancel button is hidden. Use this for hard gates (e.g. guests on `/playlist/[id]`) where continuing without auth is not allowed.

Toast notifications use **sonner** via the single `<AppToasts />` component rendered in the app shell layout (`web/src/app/(app)/layout.tsx`). Do not create new standalone toast components — add new toast triggers inside `AppToasts`. **Exception:** utility/library functions (e.g. `addEpisodeToPlaylist`) may call `toast.error()` directly via dynamic import to surface errors at the call site, without needing a component context.

### Ownership verification

Mutating playlist API routes (`PATCH`/`DELETE` on `/api/playlists/[id]`) fold `.eq('user_id', user.id)` into the Supabase query and return `404` when no rows are matched — this avoids leaking whether a private playlist ID exists. Episode sub-routes (`/api/playlists/[id]/episodes`) do a pre-flight `playlists` query with both `.eq('id', id).eq('user_id', user.id)` and return `404` on no match.

### Documentation

When asked to commit or making a plan, first check if the change introduces a new pattern, alters existing behavior, or changes an API route (parameters, return shape, or side effects). ALWAYS tell me: update `CLAUDE.md`, and create or update a focused doc file in `docs/` covering the changed area (e.g. `docs/api.md`, `docs/player.md`). Phase plan files in `docs/plans/` should also be updated if a planned item is completed or changed in scope.

