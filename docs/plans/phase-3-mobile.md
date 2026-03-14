# Phase 3 — Mobile (React Native / Expo)

## Goal
Port the web app to Android (and eventually iOS) using React Native + Expo, sharing the same Supabase backend. Single shared codebase — Android first, iOS to follow. Same freemium model as web ($4.99/month or $50/year).

The mobile app lives in `/mobile` inside the existing monorepo (web app moves to `/web`).

## Planned

### Setup
- [ ] Restructure repo into monorepo (`/web`, `/mobile`, shared `/packages`)
- [ ] Initialize Expo project in `/mobile`
- [ ] Configure Supabase client for React Native
- [ ] Set up navigation (Expo Router)

### API Architecture
Mobile uses Supabase directly — no Next.js API layer needed for data.

- [ ] Extract `/api/podcasts/feed` (RSS parser) → Supabase Edge Function
- [ ] Extract `/api/podcasts/search` (iTunes proxy) → Supabase Edge Function
- [ ] Update web app to call Edge Functions instead of its own API routes (single source of truth)
- [ ] Mobile calls Supabase client directly for all data (progress, queue, subscriptions, history) — RLS enforces security

### Core Features (parity with web)
- [ ] Auth (email + Google sign-in, Apple sign-in for iOS)
- [ ] Podcast search + subscribe
- [ ] Episode list + playback
- [ ] Background audio playback (`expo-av` or `react-native-track-player`)
- [ ] Sync (progress, subscriptions, queue, history)

### Mobile-specific
- [ ] Download manager with local storage (free tier: 3 downloads/day; paid tier: unlimited)
- [ ] Lock screen / notification controls
- [ ] Push notifications for new episodes
- [ ] Silence skipping (paid only) — native audio APIs have no CORS restriction, so real-time silence detection works. Canceled for web (Phase 2) where browser security blocks cross-origin audio analysis.

### Testing
- [ ] Unit tests for download manager logic (quota enforcement, local storage)
- [ ] Maestro E2E: search → subscribe → download → offline playback flow
- [ ] Maestro E2E: free-tier download limit enforced after 3/day

### Release
- [ ] Android: Google Play Store submission
- [ ] iOS: App Store submission (requires Apple Developer account)
