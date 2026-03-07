# Phase 2 — Web Polish

## Goal
Harden the web app with premium features, monetization, and UX improvements.

## Planned

### Freemium / Payments
- [ ] Stripe integration (subscription checkout)
- [ ] Webhook to update `user_profiles.tier` on payment
- [ ] Gate offline downloads at 2 episodes for free tier
- [ ] Remove ads for paid users

### Offline Downloads
- [ ] Download episode audio to Supabase Storage (or S3)
- [ ] Download manager UI (progress, cancel, delete)
- [ ] Play downloaded episodes without network

### Silence Skipping
- [ ] Detect silence via Web Audio API
- [ ] Skip silent sections automatically during playback

### Stats & Listening Insights
- [ ] Total listening time
- [ ] Episodes completed per week
- [ ] Streak tracking

### UX Polish
- [ ] Keyboard shortcuts (space = play/pause, arrow keys = seek)
- [ ] Notification when new episodes available for subscriptions
- [ ] Better empty states and onboarding flow
