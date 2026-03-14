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
- [ ] New episode notifications: per-podcast toggle only
- [x] Banner ad in player
- [ ] ~~Short audio ad clip before each queue auto-advance~~ — moved to Phase 4 (Ad Monetization)

**Paid tier unlocks:**
- [x] Unlimited queue
- [x] Full playback speed range selector (0.5x–3x)
- [x] Full history (kept while subscribed)
- [ ] Notification filters by name pattern (starts with / contains)
- [x] No banner ads (audio ads moved to Phase 4)
- [x] ~~Silence skipping~~ — canceled for web: Web Audio API can't analyse cross-origin audio (CORS); all podcast CDNs are cross-origin. Will be implemented in Phase 3 (mobile) where native audio APIs have no CORS restriction.
- [ ] Listening stats & insights
- [ ] OPML import/export

### ~~Silence Skipping (paid only)~~ — Canceled for web — Phase 3 (mobile) only
- The Web Audio API's `createMediaElementSource()` zeroes out cross-origin audio (browser security). Podcast audio always goes through cross-origin tracking redirects (podtrac, vpixl, etc.) that don't send CORS headers, so the analyser gets no data.
- Would require a CORS proxy (Cloudflare Worker) to work on web — not worth the complexity/cost for now.
- Native mobile (Phase 3) has no CORS restriction — silence skipping will work there via native audio APIs.

### Stats & Listening Insights (paid only)
- [ ] Total listening time
- [ ] Episodes completed per week
- [ ] Streak tracking

### UX Polish
- [x] Show subscribed podcasts on the profile page
- [x] Keyboard shortcuts (space = play/pause, arrow keys = seek)
- [ ] New episode push notifications (per-podcast toggle; paid: name pattern filters)
- [ ] ~~Audio ad clip before queue auto-advance~~ — moved to Phase 4 (Ad Monetization)
- [ ] OPML import/export
- [ ] Better empty states and onboarding flow

### Testing
- [ ] Integration tests for API routes (`/api/podcasts/search`, `/api/podcasts/feed`, `/api/progress`, `/api/queue`)
- [x] ~~Unit tests for silence-skipping logic~~ — canceled (silence skipping canceled for web)
- [ ] Unit test for Stripe webhook handler
- [ ] Playwright E2E: Stripe checkout flow (test mode)
