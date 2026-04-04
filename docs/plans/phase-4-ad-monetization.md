# Phase 4 — Ad Monetization

## Goal
Monetize free-tier users via display banner ads and audio ads between queue auto-advances.

## Stage 0: Google AdSense Display Banner ✅ Shipped

Google AdSense horizontal banner shown at the top of the content area for free-tier users only. Gated in `(app)/layout.tsx` via `isFreeTier`.

- [x] `AdBanner` component (`web/src/components/ui/AdBanner.tsx`) renders AdSense `<ins>` unit when `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` + `NEXT_PUBLIC_ADSENSE_SLOT_ID` are set
- [x] Falls back to house upgrade CTA when env vars absent (dev / pre-approval)
- [x] AdSense script rendered server-side in `<head>` in root layout (not via `next/script afterInteractive` — crawler must see it in initial HTML)
- [x] `google-adsense-account` meta tag added via `metadata.other` in root layout for meta-tag verification method
- [x] `web/public/ads.txt` — served at `syncpods.app/ads.txt` for ads.txt verification method (`google.com, pub-6453936996191895, DIRECT, f08c47fec0942fa0`)
- [x] Dismiss button persists for 24h via `localStorage` key `ad-banner-dismissed-until`
- [x] `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` set in Vercel production and `.env.local`
- [ ] **Pending:** Add `NEXT_PUBLIC_ADSENSE_SLOT_ID` once AdSense site approval completes and horizontal ad unit is created

**Setup checklist (one-time):**
1. AdSense site approval (in progress — publisher ID `ca-pub-6453936996191895` already wired)
2. In AdSense: Ads → By ad unit → Display ads → Horizontal → copy slot ID
3. Disable Auto ads (use manual placement only)
4. `echo "SLOT_ID" | vercel env add NEXT_PUBLIC_ADSENSE_SLOT_ID production` + add to `.env.local`

## Stage 1: House Ads (Audio)

Self-hosted audio clips played between episodes for free-tier users. Promotes premium upgrade or partner products.

- [ ] Build interstitial ad slot in Player.tsx `onEnded` flow (free tier only)
- [ ] "Ad playing" UI overlay with episode-up-next info
- [ ] Create house ad audio clips (e.g. "Upgrade to premium for ad-free listening")
- [ ] Serve ads from `/public/ads/` — simple random selection from available clips
- [ ] Track ad impressions (basic analytics: ad played, ad completed, ad skipped-via-upgrade)
- [ ] Paid tier bypasses ads entirely

## Stage 2: Google IMA SDK (Programmatic Audio Ads)

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
