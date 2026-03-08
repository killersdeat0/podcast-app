# Phase 2 — Web Polish

## Goal
Harden the web app with premium features, monetization, and UX improvements.

## Planned

### Freemium / Payments
- [ ] Stripe integration (subscription checkout — $4.99/month or $50/year)
- [ ] Webhook to update `user_profiles.tier` on payment
- [ ] Background job: when paid subscription lapses, clear history older than 30 days

**Free tier limits:**
- Queue capped at 10 episodes
- Playback speed: 1x and 2x only (no range selector)
- History: last 30 days only
- New episode notifications: per-podcast toggle only
- Banner ad in player
- Short audio ad clip before each queue auto-advance

**Paid tier unlocks:**
- Unlimited queue
- Full playback speed range selector (0.5x–3x)
- Full history (kept while subscribed)
- Notification filters by name pattern (starts with / contains)
- No ads (banner + audio)
- Silence skipping
- Listening stats & insights
- OPML import/export

### Silence Skipping (paid only)
- [ ] Detect silence via Web Audio API
- [ ] Skip silent sections automatically during playback

### Stats & Listening Insights (paid only)
- [ ] Total listening time
- [ ] Episodes completed per week
- [ ] Streak tracking

### UX Polish
- [ ] Keyboard shortcuts (space = play/pause, arrow keys = seek)
- [ ] New episode push notifications (per-podcast toggle; paid: name pattern filters)
- [ ] Audio ad clip before queue auto-advance (free tier only)
- [ ] OPML import/export
- [ ] Better empty states and onboarding flow

### Testing
- [ ] Integration tests for API routes (`/api/podcasts/search`, `/api/podcasts/feed`, `/api/progress`, `/api/queue`)
- [ ] Unit tests for silence-skipping logic
- [ ] Unit test for Stripe webhook handler
- [ ] Playwright E2E: Stripe checkout flow (test mode)
