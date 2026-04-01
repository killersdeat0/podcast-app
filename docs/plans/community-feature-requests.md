# Community Feature Requests

Research from Reddit (r/podcasts, r/spotify, r/pocketcasts), Spotify Community forums, Pocket Casts forums, Apple Discussions, Hacker News, and tech press (March 2026). Items below are **not already covered** in `improvements-roadmap.md` — this doc is additive.

---

## Legend
- 🔥 Extremely high demand — appears across every platform and app
- ⭐ High demand — consistently requested
- 💡 Niche but interesting — strong signal from power users

---

## 1. Trim Silence / Smart Speed 🔥

The single most-cited reason users stay on Overcast or Pocket Casts instead of moving to Spotify. Dynamically shortens silences between words without pitch distortion. Overcast's "Smart Speed" is the gold standard — 43% of iOS podcast power users prefer Overcast largely because of this feature alone (TidBITS 2024 poll). Users report saving 2–3 hours of listening time per week.

**Status for SyncPods web:** Blocked by CORS — podcast audio is cross-origin and tracking redirects (podtrac, vpixl, etc.) don't include CORS headers, so the Web Audio API graph is zeroed out. **Mobile only (Phase 3).** Still worth documenting as the #1 most-wanted feature.

---

## 2. Voice Boost / EQ Normalization ⭐

Overcast and Pocket Casts both offer audio processing that normalizes loudness and boosts vocal clarity. Podcasts recorded in different environments vary wildly in volume. Users describe switching episodes as "jarring" without it.

**Status for SyncPods web:** Same CORS blocker as trim silence — Web Audio API can't analyze cross-origin audio. **Mobile only.**

---

## 3. Bookmarks with Timestamped Notes ⭐

Distinct from clip sharing (already in roadmap #11). Users want to tap a button mid-episode, optionally type a note, and save a bookmark tied to that exact timestamp. Use cases: book/resource recommendations mentioned in the episode, facts to look up, quotes to remember.

Spotify has had open feature request threads on this for years — one was officially closed without implementation. A third-party workaround app (spotifybookmarks.app) was independently built to fill this gap.

**Potential features:**
- Bookmark button in player (saves timestamp + optional note text)
- Bookmarks list per episode, accessible from episode detail
- Export bookmarks (CSV, Markdown) — ties into PKM integration below

---

## 4. Configurable Skip Interval 🔥

Spotify's skip buttons are fixed at 15s forward / 15s back. Users want to set their own values (common preferences: 30s forward, 10s back — or 45s/15s for skipping ads). This is table-stakes in Overcast and Pocket Casts and has been a Spotify community request for years.

**Implementation:** A single setting in Settings page — two number inputs for forward and backward skip duration. Player reads from settings on mount.

**Status: ✅ Shipped** — Two dropdowns (5s–90s) in Settings → Playback. Player reads `skip-back-seconds` / `skip-forward-seconds` from localStorage on mount and listens for `skip-intervals-changed` events. Defaults: 15s back / 30s forward.

---

## 5. OPML Import / Export ⭐

OPML (Outline Processor Markup Language) is the standard format for transferring podcast subscription lists between apps. Pocket Casts, Overcast, and AntennaPod all support it. Spotify doesn't — users feel locked in and can't migrate away easily.

This is a trust signal as much as a feature: offering OPML export tells users their data is theirs. It drove significant backlash when Castro died in January 2024 with no export — users had no way to recover their library.

**Implementation:**
- `GET /api/subscriptions/export.opml` — generates OPML from user's subscriptions
- Import: parse uploaded OPML, batch-subscribe to feeds

---

## 6. Private / Custom RSS Feed Support ⭐

The only major podcast app that doesn't let users add a podcast by RSS URL is Spotify. Patreon's help docs explicitly call this out. Users with paid Patreon subscriptions (which give a private RSS feed URL) can't listen through Spotify at all.

SyncPods already fetches via RSS — this would extend that to allow:
- Adding a podcast by raw RSS URL (including password-protected feeds)
- Storing auth credentials (username/password in the URL, or header-based) per subscription

Highly differentiating against Spotify. Patreon listeners are an underserved, paying segment.

---

## 7. Sleep Timer 💡

Basic hygiene feature that Spotify only has on mobile (and temporarily lost on iOS in 2024) and doesn't have on desktop at all. Users want:

- Standard timer durations (15 / 30 / 45 / 60 min + end of episode)
- **Default sleep timer** — set it once for all podcast sessions (very commonly requested; Spotify has an official "Closed Idea" for this)
- **Smart timer** — pause at end of current sentence/natural pause rather than mid-word

---

## 8. Persistent Filter / Sort State ⭐

Users sort or filter a podcast's episode list (e.g., "show only unplayed, oldest first") and the preference resets every time they navigate away. Spotify acknowledges this as "expected behavior" — which infuriates users.

**Implementation:** Persist sort + filter preferences per feed URL in localStorage. Restore on next visit to the same podcast page.

---

## 9. PKM / Note-Taking Integration 💡

A gap large enough that Snipd was built entirely to fill it. Users treat podcast listening as part of a knowledge workflow — alongside articles (Readwise), books (Kindle highlights), and video (Glasp). Podcasts are the missing piece.

What power users want:
- Export highlights/bookmarks (from item 3 above) to **Readwise, Notion, Obsidian, Logseq**
- Include episode metadata (show, date, URL) in exports
- Optionally attach AI-generated transcript excerpt for the bookmarked moment

Ties directly into transcript feature (roadmap #8/#15) and bookmarks (item 3 above). A Readwise webhook integration would be a strong differentiator for the paid tier.

---

## 10. Inbox / Triage Queue Mode 💡

Castro built its entire identity around this: new episodes arrive in an **inbox**, and you swipe each one to either add it to your queue or delete it. This is fundamentally different from the "subscribe and it all piles up" model.

Users who miss Castro's triage UI specifically cite:
- Control over what's in their queue without bulk-managing a list
- A natural "daily triage" habit — review new episodes each morning, queue up the ones you want

**Implementation:** A separate "Inbox" view showing unplayed episodes from subscribed shows, sorted newest-first, with quick queue/dismiss actions. Would replace or complement the existing queue model.

---

## 11. Per-Show Auto-Delete / Download Policy 💡

Users want granular storage control per podcast, not a global setting:

- "Keep all episodes for Serial (narrative, I might re-listen)"
- "Keep only the latest 3 episodes for daily news shows"
- "Delete immediately after listening for everything else"

Pocket Casts partially supports this. Power users on HN specifically requested this. Overcast's auto-delete is reportedly buggy, causing storage bloat.

**Implementation:** Per-subscription settings (new columns on `subscriptions` table): `keep_count` (null = keep all, N = keep latest N), `delete_after_played` (boolean).

---

## 12. Smarter / Context-Aware Notifications 💡

Users want more than on/off per show (roadmap #5 already covers basic per-show notification settings). The "smart" version they describe:

- "Only notify me about a new episode if my queue is empty"
- "Batch daily digest: what's new across all my subscriptions" instead of one notification per episode
- "Alert me only for episodes over 20 minutes" (filter by episode length)

---

## 13. CarPlay / Android Auto Support ⭐

Commonly requested for any podcast app that wants to compete with Spotify or Apple Podcasts. Users listen while driving and want:

- Episode list browsable via car touchscreen / steering wheel controls
- Speed controls accessible without picking up the phone
- Chapter navigation in-car

**Status:** Requires native mobile implementation. Web app can't do CarPlay. Mobile Phase 3.

---

## 14. Discovery: "What My Friends Listen To" ⭐

The research is clear: algorithms reach only ~3% of podcast listeners. The dominant discovery methods are word-of-mouth (18%) and social media (15%). No major app has a good answer to "what are people I trust listening to?"

Users want:
- Optional public listening activity (opt-in)
- See what a specific person/friend is listening to
- Shared episode recommendations with a note ("you'd love this episode — the part at 43min is wild")

Partially covered by roadmap #19 (social follow graph) but that's marked long-term/XL. A lighter version — shareable "what I'm listening to" profile page — could be a Medium effort.

---

## 15. Chapter Navigation Improvements ⭐

Apple Podcasts and Pocket Casts support proper chapter markers from RSS feeds (`<podcast:chapters>` or `<psc:chapters>`). Users want:

- Visual chapter list in the player (jump to any chapter)
- Auto-advance to next chapter on forward skip (instead of fixed-second jumps)
- Chapter titles shown in progress bar / on lock screen

Podcast 2.0's `<podcast:chapters>` JSON format is the standard. Ties into roadmap #8 (Podcasting 2.0 support).

---

## 16. "Continue Listening" Across All Episodes (not just recent) ⭐

Users who listen to long-form podcasts across many weeks want a "all in-progress episodes" view — not just the 5–10 that fit in a "Continue Listening" section. Spotify and Apple both truncate this, frustrating users mid-series.

**Implementation:** A dedicated `/history?filter=in_progress` view showing all episodes with `0 < position_pct < 0.98`, sorted by most-recently-played.

---

## Priority Ranking: Actionability × Feasibility

Sorted by combined score of **demand**, **effort**, and **how much existing infrastructure SyncPods already has**.

Feasibility key: ✅ Fully unblocked · ⚠️ Minor unknowns · 🔶 Needs design/dependencies · ❌ Blocked (CORS)

| Rank | # | Feature | Effort | Feasibility | Notes |
|------|---|---------|--------|-------------|-------|
| 1 | 4 | Configurable skip interval | XS | ✅ | ~~One Settings field; Player reads it on mount. Zero dependencies.~~ **Shipped.** |
| 2 | 8 | Persistent filter/sort state | XS | ✅ | ~~Save to localStorage keyed by feedUrl. One `useEffect`.~~ **Shipped.** |
| 3 | 16 | All in-progress episodes view | XS | ✅ | Filter toggle on existing history query (`0 < position_pct < 0.98`). |
| 4 | 7 | Sleep timer | S | ✅ | Client-side only. Countdown → pause audio. No DB or API needed. |
| 5 | 5 | OPML export | S | ✅ | One new API route; serialize subscriptions to XML. Import adds ~1 day. |
| 6 | 15 | Chapter navigation | M | ⚠️ | Parse `<podcast:chapters>` in feed Edge Function; render chapter list in Player. Ties into roadmap #8. |
| 7 | 6 | Private RSS feed support | M | ⚠️ | Already fetch RSS. Need to store auth credentials per subscription and thread them through feed Edge Function. Patreon users immediately unlocked. |
| 8 | 3 | Bookmarks with timestamped notes | M | ⚠️ | New DB table + bookmark button in Player + episode detail list. Well-scoped but touches several layers. |
| 9 | 9 | PKM / Readwise integration | M | 🔶 | Depends on bookmarks (#8) being done first. Then a webhook/export endpoint. Strong paid-tier differentiator. |
| 10 | 10 | Inbox / triage mode | L | 🔶 | Requires rethinking queue UX. Ex-Castro audience is loyal but niche. |
| — | 1 | Trim silence / Smart Speed | — | ❌ | #1 most-wanted industry-wide. Web blocked by CORS. Mobile Phase 3 only. |
| — | 2 | Voice Boost / EQ normalization | — | ❌ | Same CORS blocker. Mobile Phase 3 only. |
