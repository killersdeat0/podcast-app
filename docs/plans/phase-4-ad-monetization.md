# Phase 4 — Ad Monetization

## Goal
Monetize free-tier users with audio ads between queue auto-advances. Start with house ads (self-hosted), then migrate to programmatic ads via Google IMA SDK when traffic justifies it.

## Stage 1: House Ads

Self-hosted audio clips played between episodes for free-tier users. Promotes premium upgrade or partner products.

- [ ] Build interstitial ad slot in Player.tsx `onEnded` flow (free tier only)
- [ ] "Ad playing" UI overlay with episode-up-next info
- [ ] Create house ad audio clips (e.g. "Upgrade to premium for ad-free listening")
- [ ] Serve ads from `/public/ads/` — simple random selection from available clips
- [ ] Track ad impressions (basic analytics: ad played, ad completed, ad skipped-via-upgrade)
- [ ] Paid tier bypasses ads entirely

## Stage 2: Google IMA SDK (Programmatic Ads)

Swap house ads for personalized, revenue-generating ads via Google Ad Manager + IMA SDK.

- [ ] Set up Google Ad Manager account and create audio ad unit
- [ ] Generate VAST tag URL (`ad_type=audio`, `env=instream`)
- [ ] Integrate Google IMA SDK for HTML5 (`ima3.js`)
- [ ] Pass `<audio>` element to IMA `AdDisplayContainer`
- [ ] Handle ad lifecycle: request → load → play → complete → advance queue
- [ ] Fallback to house ads when no programmatic fill is available
- [ ] Companion banner ad display during audio ad playback (optional)

## Stage 3: Mobile Ads (after Phase 3)

- [ ] Integrate Google IMA SDK for Android/iOS in the mobile app
- [ ] AdTonos SandstormSDK as alternative for mobile-specific audio ads
- [ ] Unified ad impression tracking across web and mobile

## Stage 4: Personalized Recommendations

Leverage user subscription and listening data to surface relevant podcasts on the discover page, similar to how ads are personalized by behavior.

- [ ] "Because you listen to X" recommendation sections on discover page
- [ ] Collaborative filtering: users who subscribe to X also subscribe to Y
- [ ] Genre-weighted suggestions based on subscription mix
- [ ] Listening history signals (most-played genres, completion rates)
- [ ] Blend personalized recommendations with trending results on discover page

## Notes on Playlist Compatibility

Playlist auto-advance goes through the same `completeAndAdvance` path in `Player.tsx` as queue auto-advance. Phase 4 audio ad interstitials (Stage 1/2) will apply to playlist playback automatically without additional changes.

## Notes

- Spotify/Pandora play 15-30s unskippable ads personalized by demographics, location, and listening behavior
- Indie podcast apps (Overcast, Pocket Casts) typically use visual banner ads only — playing audio ads between episodes is a differentiator
- Google IMA SDK is free for small publishers and provides programmatic demand via AdX
- AdTonos is an alternative with VAST/DAAST support and mobile SDKs
