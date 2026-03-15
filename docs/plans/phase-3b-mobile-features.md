# Phase 3b — Mobile Features

## Goal
Implement full feature parity with the web app plus mobile-only features (downloads, lock screen,
push notifications, silence skipping), then ship to Google Play and the App Store.

All features follow the UDF pattern established in Phase 3a (see `docs/plans/phase-3a-mobile-setup.md`):
each feature gets a `<Feature>Feature.kt` (commonMain), `<Feature>Screen.kt` (commonMain),
and `<Feature>ViewModel.kt` (androidMain).

## Planned

### Core Features (parity with web)
- [ ] Auth — `AuthFeature` + `AuthScreen`; Supabase KMP Auth client; email + Google OAuth;
      Apple sign-in for iOS (expect/actual OAuth handler)
- [ ] Podcast search + subscribe — `SearchFeature` + `SearchScreen`; calls Supabase Edge Function
      (`/functions/v1/podcasts-search`); results rendered in lazy column
- [ ] Episode list + playback — `EpisodeListFeature` + `PlayerFeature`; audio via `Media3` (Android)
      / `AVPlayer` (iOS) behind expect/actual `AudioPlayer` interface
- [ ] Background audio playback — Android: `MediaSessionService` (Media3); iOS: `AVAudioSession`
      with background mode; controlled via `AudioPlayer` expect/actual
- [ ] Sync (progress, subscriptions, queue, history) — direct Supabase KMP client calls;
      RLS enforces per-user access; same DB schema as web
- [ ] Playlists — `PlaylistFeature`; CRUD via Supabase; sequential auto-advance; share via deep link

### Mobile-specific
- [ ] Download manager — `DownloadFeature`; Android: `WorkManager` + `DownloadManager`;
      iOS: `URLSession` background download task; expect/actual `Downloader` interface;
      free tier: 3 downloads/day; paid: unlimited (enforced in `DownloadFeature` via Supabase quota check)
- [ ] Lock screen / notification controls — Android: `MediaSession` + `MediaStyleNotification` (Media3);
      iOS: `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`; expect/actual `NowPlayingController`
- [ ] Push notifications for new episodes — Supabase Edge Function cron calls FCM (Android) / APNs (iOS);
      `last_feed_checked_at` cache column already in place from Phase 2.5
- [ ] Silence skipping (paid only) — Android: `AudioRecord` + `AudioTrack`; iOS: `AVAudioEngine`;
      expect/actual `SilenceSkipper`; no CORS restriction on native (unlike web)

### Testing
- [ ] Unit tests for `DownloadFeature` (quota enforcement, state transitions) using Turbine + MockK
- [ ] Unit tests for `PlayerFeature` (play/pause/seek/queue advance) using Turbine + MockK
- [ ] Maestro E2E (Android): search → subscribe → download → offline playback flow
- [ ] Maestro E2E (Android): free-tier download limit enforced after 3/day
- [ ] iOS: XCUITest or manual QA for auth, playback, lock screen controls

### Release
- [ ] Android: Google Play Store submission
- [ ] iOS: App Store submission (requires Apple Developer account)
