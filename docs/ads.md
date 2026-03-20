# Audio Ads — Future Implementation Guide

This document captures research and architectural decisions for adding audio ads to PodSync. Not yet implemented.

---

## Recommended approach: server-side DAI (Dynamic Ad Insertion)

The simplest and most compatible path. A DAI provider (Megaphone, AdsWizz, Spotify Audience Network) stitches ads into the audio server-side before delivery. From the app's perspective, the episode URL just returns a longer audio file — no client-side ad SDK needed.

**How it works:**
1. Publisher uploads clean audio to the DAI provider
2. DAI provider marks break points (pre-roll, mid-roll, post-roll)
3. At request time, the provider stitches in ads and returns a single audio file
4. The app plays it like any other episode — no special handling

**Pros:** simple integration, works with existing player, ad tracking handled server-side, no CORS issues
**Cons:** you don't control ad creative directly (depends on provider's inventory), revenue share with provider, adds latency to episode start

**Standard slot lengths:**
- Pre-roll: 15–30s
- Mid-roll: 60s (most common), sometimes 90s
- Post-roll: 15–30s

---

## Alternative: client-side VAST

VAST (Video Ad Serving Template) is the IAB standard for ad serving. The client requests an ad from a VAST endpoint at each cue point and plays it inline.

**Why this is hard:**
- Must handle VAST XML parsing and ad URL resolution
- Must fire tracking pixels (impression, first quartile, midpoint, third quartile, complete) — legally required by ad networks
- Must manage ad audio playback lifecycle separately from content audio
- No good open-source podcast-specific library; most options are video-focused (Google IMA SDK, THEOplayer)
- CORS issues possible with ad CDNs

**Verdict:** not recommended unless building a large ad-supported product with dedicated ad engineering. DAI is the right call for a podcast app.

---

## Resume accuracy with dynamic ads

Storing `position_pct` (see `docs/player.md`) is more resilient than `position_seconds` for DAI content, because ads cluster at fixed break points rather than being uniformly distributed. Swapping ad creative in and out freely (same slot positions, same slot lengths) has zero impact on resume accuracy. Adding or removing a mid-roll slot shifts resume position by up to one slot length (~60s) — same limitation as Apple Podcasts and Spotify.

---

## Podlove chapters / ad break timestamps

Podlove chapters (`<podcast:chapters>` JSON) can expose ad break timestamps, which would allow the client to adjust `position_seconds` on resume by accounting for which ad breaks fall before the saved position.

**Coverage reality:**
- Chapters of any kind (Podlove, ID3, `<podcast:chapters>`): ~10–15% of podcasts
- Podlove specifically: ~3–5%, heavily skewed toward tech/indie and German-language podcasts (Podcasting 2.0 ecosystem, Changelog, ATP)
- Major commercial podcasts with heavy ad loads (NPR, Dateline, iHeart): almost none — they control their own DAI infrastructure and don't need it

**Key problem:** the podcasts most affected by DAI duration drift are exactly the ones least likely to have Podlove chapters. Not worth implementing as a near-term feature given the coverage gap.

**If implemented in the future:** the app already fetches and parses chapter JSON for tick marks in the player (`GET /api/podcasts/chapters`). Ad break markers are just chapters with a specific `type` field. Adjusting resume position would mean counting breaks before `position_seconds` and adding their durations — roughly a day's work on top of existing chapter support.

---

## Implementation checklist (when ready)

- [ ] Choose DAI provider and negotiate revenue share
- [ ] Decide free-tier vs. paid-tier ad policy (e.g. ads only for free users)
- [ ] Update `Player.tsx` to handle pre-roll delay before content starts (or rely on DAI stitching)
- [ ] Add `TODO` marker in `completeAndAdvance` already exists in source for inserting an ad clip between episode end and auto-advance
- [ ] Consider Podlove chapter ad break adjustment for resume accuracy (low priority given coverage)
- [ ] Ensure `position_pct` is saved correctly so resume works across DAI slot changes
