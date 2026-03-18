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

**Before committing:** always run unit tests (`cd web && npm test -- --run`).

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

### i18n

All user-facing strings live in `web/src/lib/i18n/`. The active locale is stored in `localStorage` and toggled from **Profile → Language**. Use `useStrings()` from `LocaleContext.tsx` in every client component — never the static `strings` export from `index.ts`. When writing or editing user-visible text, keep it fun: use emojis in titles/empty states and write CTAs as actions. See `docs/i18n.md` for the full guide.

### Global playback state

`PlayerContext` (`web/src/components/player/PlayerContext.tsx`) holds `nowPlaying` in React state. On mount it restores `nowPlaying` from `localStorage` via `useEffect` (not initial state — avoids SSR hydration mismatch). The `play()` call persists to `localStorage`.

The `Player` component (`web/src/components/player/Player.tsx`) always renders the `<audio>` element (even when `nowPlaying` is null) so that event listeners attach on mount. The UI is conditionally shown. It restores saved position from `/api/progress` on episode load (only auto-plays if `playing` is true), saves position to `/api/progress` every 10 seconds via throttle, and on `ended` marks the episode complete, removes it from the queue, and auto-plays the next queue item.

### Silence skipping — web blocked, canceled for web, mobile only

`useSilenceSkipper` (`web/src/hooks/useSilenceSkipper.ts`) uses the Web Audio API (`createMediaElementSource` + `AnalyserNode`) to detect and skip silent sections. **This does not work on the web** because all podcast audio is cross-origin and the tracking redirect chain (podtrac, vpixl, etc.) doesn't send CORS headers — the browser zeroes out the entire audio graph. A CORS proxy (Cloudflare Worker) would fix it but isn't worth the complexity yet. The feature is canceled for web; will be implemented in Phase 3 (mobile), where native audio APIs have no CORS restriction. Do not re-attempt a browser-only fix without a proxy.

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

All freemium caps live in `web/src/lib/limits.ts` — **never hardcode limit numbers in route files or UI**. Import `LIMITS` from there. Current values:

| | Free | Paid |
|---|---|---|
| Queue items | 10 | 500 |
| Playlists | 3 | 1,000 |
| Episodes per playlist | 10 | 500 |
| Subscriptions | 500 | 500 |

### Admin client

`web/src/lib/supabase/admin.ts` exports `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY` (server-only — never `NEXT_PUBLIC_*`). Used **only** for serving public playlist reads to unauthenticated users in `GET /api/playlists/[id]`. For all other API routes use `createClient()` from `@/lib/supabase/server`.

### Playlist player integration

`NowPlaying` (in `PlayerContext.tsx`) has an optional `playlistContext?: { playlistId: string; episodes: PlaylistEpisodeRef[] } | null`. When set, `Player.tsx` advances through playlist episodes non-destructively — does not touch the queue. The context is persisted automatically via the existing `play()` localStorage write.

Use `playPlaylist(playlistId, episodes, startIndex?)` from `usePlayer()` to start playlist playback. It wraps `play()` with the correct `playlistContext`.

### Theming and colors

Both web and mobile use **Material3** color roles as the shared design vocabulary. Source color: `#7c3aed` (violet-600).

**Web:** All colors are defined as `--md-*` CSS custom properties in `web/src/app/globals.css` and exposed as Tailwind utilities via `@theme inline`. Use semantic tokens — `bg-surface`, `text-on-surface-variant`, `bg-primary`, `text-error` — never raw palette classes like `bg-gray-950` or `text-violet-400`.

**Mobile:** `SyncPodsTheme` in `mobile/.../theme/Theme.kt` wraps `MaterialTheme` with a custom `darkColorScheme`. All Composables use `MaterialTheme.colorScheme.*` — never hardcoded hex values.

See `docs/theming.md` for the full token table and light-theme migration notes.

### Modals and toasts

All modal dialogs use `@radix-ui/react-dialog` (`import * as Dialog from '@radix-ui/react-dialog'`). Do not use custom backdrop + `useEscapeKey` patterns for new modals — Radix Dialog provides focus trap, escape handling, and accessible close for free. Pattern: `<Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>` with `<Dialog.Portal>`, `<Dialog.Overlay>`, and `<Dialog.Content>`.

Toast notifications use **sonner** via the single `<AppToasts />` component rendered in the app shell layout (`web/src/app/(app)/layout.tsx`). Do not create new standalone toast components — add new toast triggers inside `AppToasts`.

### Ownership verification

`web/src/lib/playlists/verifyOwnership.ts` exports `verifyPlaylistOwnership(playlistId, userId): Promise<boolean>`. All mutating playlist API routes call this before proceeding.

### Documentation

When asked to commit or making a plan, first check if the change introduces a new pattern, alters existing behavior, or changes an API route (parameters, return shape, or side effects). ALWAYS tell me: update `CLAUDE.md`, and create or update a focused doc file in `docs/` covering the changed area (e.g. `docs/api.md`, `docs/player.md`). Phase plan files in `docs/plans/` should also be updated if a planned item is completed or changed in scope.

### ESLint intentional suppressions

Several files use `// eslint-disable-next-line` for patterns that are deliberately non-standard:

- `PlayerContext.tsx`, `Sidebar.tsx`, `LocaleContext.tsx` — `react-hooks/set-state-in-effect`: `setState` called directly inside `useEffect` to restore `localStorage` state on mount. This is intentional to avoid SSR hydration mismatches (initial state can't read `localStorage` on the server).
- `Player.tsx` — `react-hooks/refs`: `isDragging.current` read during render to control the slider value while dragging. Intentional — a state variable would cause unwanted re-renders.
- `podcast/[id]/page.tsx` — `react-hooks/exhaustive-deps` on the on-mount subscription PATCH effect: intentionally uses `newEpisodes.length` (not the full array or `title`) as the dependency. `title` is a URL param stable for the component lifetime; the array ref changes every render but we only want to re-fire when the count changes.

Do not remove these suppressions or refactor these patterns without understanding the SSR/performance trade-offs.

### RSS parser quirk

The `guid` field in RSS items can be an XML object `{ '#text': '...', '@_isPermaLink': 'false' }` rather than a plain string. The Edge Function (`supabase/functions/podcasts-feed/index.ts`) handles this — do not simplify it back to `String(item['guid'])`.
