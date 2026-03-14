# Phase 2 — Web Polish

## Goal
Harden the web app with premium features, monetization, and UX improvements.

## Planned

### Freemium / Payments
- [x] Stripe integration (subscription checkout — $4.99/month or $50/year)
- [x] Webhook to update `user_profiles.tier` on payment
- [ ] Background job: when paid subscription lapses, clear history older than 30 days
- [x] Dev-only downgrade button on profile page (resets tier to free without Stripe)

**Free tier limits:**
- [x] Queue capped at 10 episodes
- [x] Playback speed: 1x and 2x only (no range selector)
- [x] History: last 30 days only
- [x] New episode badge: dot on sidebar + profile subscription items; "New" section on podcast detail page; paid users can set per-subscription episode title filter
- [x] Banner ad in player
- [ ] ~~Short audio ad clip before each queue auto-advance~~ — moved to Phase 4 (Ad Monetization)

**Paid tier unlocks:**
- [x] Unlimited queue
- [x] Full playback speed range selector (0.5x–3x)
- [x] Full history (kept while subscribed)
- [x] Notification filters by name pattern (starts with / contains) — implemented as `episode_filter` on subscriptions
- [x] No banner ads (audio ads moved to Phase 4)
- [x] ~~Silence skipping~~ — canceled for web: Web Audio API can't analyse cross-origin audio (CORS); all podcast CDNs are cross-origin. Will be implemented in Phase 3 (mobile) where native audio APIs have no CORS restriction.
- [x] Listening stats & insights
- [x] OPML import/export

### ~~Silence Skipping (paid only)~~ — Canceled for web — Phase 3 (mobile) only
- The Web Audio API's `createMediaElementSource()` zeroes out cross-origin audio (browser security). Podcast audio always goes through cross-origin tracking redirects (podtrac, vpixl, etc.) that don't send CORS headers, so the analyser gets no data.
- Would require a CORS proxy (Cloudflare Worker) to work on web — not worth the complexity/cost for now.
- Native mobile (Phase 3) has no CORS restriction — silence skipping will work there via native audio APIs.

### Stats & Listening Insights (paid only)
- [x] Total listening time
- [x] Episodes completed per week
- [x] Streak tracking

### Discovery
- [x] Trending/popular podcasts on discover page (Apple Top Charts + iTunes Lookup)
- [x] Genre tabs for browsing by category (Comedy, Technology, News, etc.)

### UX Polish
- [x] Show subscribed podcasts on the profile page
- [x] Keyboard shortcuts (space = play/pause, arrow keys = seek)
- [x] New episode badge + episode search (see Freemium section above)
- [ ] ~~Audio ad clip before queue auto-advance~~ — moved to Phase 4 (Ad Monetization)
- [x] OPML import/export
- [ ] Better empty states and onboarding flow

### Known Bugs
- [ ] Episode search (iTunes lookup via `/api/podcasts/episodes`) not returning episodes that are known to exist — suspected cause: iTunes Lookup API returning unexpected field names or omitting episodes; needs investigation (logging the raw API response is a good first step)

### Testing
- [x] Unit tests for API routes (`/api/podcasts/search`, `/api/podcasts/feed`, `/api/progress`, `/api/queue`) — route handlers tested with mocked fetch and mocked Supabase client
- [x] ~~Unit tests for silence-skipping logic~~ — canceled (silence skipping canceled for web)
- [ ] Unit test for Stripe webhook handler
- [ ] Playwright E2E: Stripe checkout flow (test mode)
