# Screen: Full Player + Mini Player

> Source: [`docs/plans/phase-3b-mobile-features.md`](../../phase-3b-mobile-features.md)

## Description
Audio playback UI in two modes: a persistent mini player bar docked at the bottom of the app shell, and a full-screen player expanded by tapping the mini player.

## Contents

### Mini Player (always visible when `nowPlaying != null`)
- Artwork thumbnail — tapping navigates to the Podcast Detail screen for the currently playing show
- Episode title — scrolls (marquee) when the text overflows the available width; truncates with ellipsis when it fits
- Play / Pause button
- Skip forward 15 s button

### Full Player
- Large artwork
- Episode title and podcast name
- Scrubber with chapter markers
- Play / Pause, Skip back 15 s, Skip forward 15 s
- Playback speed selector: 1x / 2x (free) · 0.5x – 3x (paid)
- Silence skip toggle (paid only)
- Sleep timer
- Queue-ahead preview (next up)
- Banner ad slot (free tier)

## Navigation
- **Arrives from:** Mini Player tap · Podcast Detail episode play · Queue episode tap
- **Goes to:** Upgrade Sheet (free: silence skip or extended speed range)
- **Dismisses:** Swipe down to collapse back to mini player

## Feature Gates
| Element | Free | Paid |
|---------|------|------|
| Speed: 1x / 2x | ✓ | ✓ |
| Speed: 0.5x – 3x full range | Upgrade Sheet | ✓ |
| Silence skip | Upgrade Sheet | ✓ |
| Banner ads | ✓ | — |

## Implementation

| File | Source Set |
|------|------------|
| `player/PlayerFeature.kt` | `commonMain` |
| `player/PlayerScreen.kt` | `commonMain` |
| `player/MiniPlayerBar.kt` | `commonMain` (composable) |
| `player/PlayerViewModel.kt` | `androidMain` |

**Platform-specific audio:**
- Android: `Media3 ExoPlayer` behind `expect class AudioPlayer`
- iOS: `AVPlayer` behind `actual class AudioPlayer`

**Lock screen / notification controls:**
- Android: `MediaSession` + `MediaStyleNotification` (Media3) via expect/actual `NowPlayingController`
- iOS: `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` via expect/actual `NowPlayingController`

**Silence skipping (paid):**
- Android: `AudioRecord` + `AudioTrack`
- iOS: `AVAudioEngine`
- Interface: `expect class SilenceSkipper`
