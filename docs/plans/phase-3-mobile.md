# Phase 3 — Mobile (React Native / Expo)

## Goal
Port the web app to Android (and eventually iOS) using React Native + Expo, sharing the same Supabase backend.

## Planned

### Setup
- [ ] Initialize Expo project (separate repo or monorepo)
- [ ] Configure Supabase client for React Native
- [ ] Set up navigation (Expo Router)

### Core Features (parity with web)
- [ ] Auth (email + Google sign-in, Apple sign-in for iOS)
- [ ] Podcast search + subscribe
- [ ] Episode list + playback
- [ ] Background audio playback (`expo-av` or `react-native-track-player`)
- [ ] Sync (progress, subscriptions, queue, history)

### Mobile-specific
- [ ] Download manager with local storage
- [ ] Lock screen / notification controls
- [ ] Push notifications for new episodes

### Release
- [ ] Android: Google Play Store submission
- [ ] iOS: App Store submission (requires Apple Developer account)
