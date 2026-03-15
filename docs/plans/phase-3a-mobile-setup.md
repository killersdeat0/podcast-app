# Phase 3a — Mobile Setup

## Goal
Scaffold the mobile project and set up shared backend infrastructure so that both the web app and the upcoming mobile app share a single source of truth for podcast data.

## Planned

### Setup
- [ ] Restructure repo into monorepo (`/web`, `/mobile`, shared `/packages`)
- [ ] Initialize Expo project in `/mobile`
- [ ] Configure Supabase client for React Native
- [ ] Set up navigation (Expo Router)

### API Architecture
Mobile uses Supabase directly — no Next.js API layer needed for data. The RSS and search logic must be extracted to Edge Functions so mobile can call them without going through the web server.

- [ ] Extract `/api/podcasts/feed` (RSS parser) → Supabase Edge Function
- [ ] Extract `/api/podcasts/search` (iTunes proxy) → Supabase Edge Function
- [ ] Update web app to call Edge Functions instead of its own API routes (single source of truth)
- [ ] Mobile calls Supabase client directly for all data (progress, queue, subscriptions, history) — RLS enforces security
