# Phase 3b — Mobile Features

## Goal
Implement full feature parity with the web app plus mobile-only features (downloads, lock screen, push notifications, silence skipping), then ship to Google Play and the App Store.

## Planned

### Core Features (parity with web)
- [ ] Auth (email + Google sign-in, Apple sign-in for iOS)
- [ ] Podcast search + subscribe
- [ ] Episode list + playback
- [ ] Background audio playback (`expo-av` or `react-native-track-player`)
- [ ] Sync (progress, subscriptions, queue, history)
- [ ] Playlists — create, edit, delete; sequential auto-advance; share public playlists via URL

### Mobile-specific
- [ ] Download manager with local storage (free tier: 3 downloads/day; paid tier: unlimited)
- [ ] Lock screen / notification controls
- [ ] Push notifications for new episodes — implement as a Supabase Edge Function cron (see `docs/plans/phase-2.5-feed-refresh.md`); the `last_feed_checked_at` cache column is already in place from Phase 2.5
- [ ] Silence skipping (paid only) — native audio APIs have no CORS restriction, so real-time silence detection works. Canceled for web (Phase 2) where browser security blocks cross-origin audio analysis.

### Testing
- [ ] Unit tests for download manager logic (quota enforcement, local storage)
- [ ] Maestro E2E: search → subscribe → download → offline playback flow
- [ ] Maestro E2E: free-tier download limit enforced after 3/day

### Release
- [ ] Android: Google Play Store submission
- [ ] iOS: App Store submission (requires Apple Developer account)
