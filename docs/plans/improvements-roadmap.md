# Improvements Roadmap

Competitive analysis against Pocket Casts, Overcast, Spotify, Apple Podcasts, Castro, Snipd, and others. Items ordered by effort and priority.

---

## Easy Wins

### 1. Similar Podcasts on Podcast Detail Page
`/api/podcasts/similar` is fully implemented. Wire it into the UI as a "You might also like 🎧" section at the bottom of `/podcast/[id]`.
- [x] Add `SimilarPodcasts` section to podcast detail page using existing API + `PodcastCard`

### 2. Per-Show Playback Speed Memory
Store preferred speed per `feedUrl` — picker on the podcast detail page (paid+subscribed users only). DB-backed via `subscriptions.speed_override`; localStorage is the fast read path (synced on page mount). Auto-applied when Player loads an episode.
- [x] Add speed picker to podcast detail page (inline with subscribe button, paid+subscribed only)
- [x] DB-backed: `PATCH /api/subscriptions` with `speedOverride`; migration `20260327000000_subscriptions_speed_override.sql`
- [x] localStorage key `podcast-speed-{feedUrl}` synced from DB on subscription load
- [x] Player reads per-show speed on episode load, falls back to global default (`playback-speed` key)

### 3. Undo Accidental Skip
When auto-advance or a skip action fires, show a brief toast with an "Undo" action that restores the previous episode/position. Purely client-side.
- [x] Track `previousEpisode` + `previousPosition` in `PlayerContext`
- [x] Show "Undo" action in toast on advance/skip; restore on tap

### 4. Settings Page
Consolidate scattered settings into a `/settings` page: language, default playback speed, volume, notification preferences, sign-out, account danger zone.
- [x] Create `/settings` route under `(app)`
- [x] Move language picker from Profile to Settings
- [x] Add default speed (localStorage, ephemeral across sessions) + volume (DB-backed cross-device via `user_profiles.default_volume`)
- [x] Add sign-out button
- [x] Add "Delete account" danger zone (Radix Dialog confirmation)
- [x] Link to Settings from sidebar (Settings icon) and from Profile page ("Settings →" link)

### 5. Notification Settings UI Per Podcast ✅
`episode_filter` column already exists in DB. Add a settings popover on the podcast detail page / subscription list to configure per-podcast new-episode notifications.
- [x] Add notification settings UI to podcast detail page (popover or inline toggle)
- [x] Wire to existing `episode_filter` column via `PATCH /api/subscriptions`
- [x] Gate `*` (all episodes) on paid tier

### 6. Dedicated Stats Page
Two pre-aggregated tables capture listening data at write time, making stat queries trivially cheap. Written to on every 10s progress save (server-side, in `POST /api/progress`). Can throttle to 60s later if needed.

**`listening_daily`** — one row per user per day, upserted:
- `user_id`, `date` (date), `seconds_listened` (integer, incremented)
- Powers: streak, day-of-week chart, monthly trend

**`listening_by_show`** — one row per user per feed, upserted:
- `user_id`, `feed_url`, `seconds_listened` (integer, incremented), `episodes_completed` (integer, incremented), `last_listened_at` (timestamptz, overwritten)
- No FK to `subscriptions` — stats survive unsubscribe
- `episodes_completed` only increments on `false → true` transition (check previous `playback_progress.completed` before upsert)
- Powers: top shows, per-show completion count

**Tier gating:**
- Data stored for all users regardless of tier
- Free: `listening_daily` queries limited to last 30 days; show "📊 Unlock your full listening history" upsell nudge
- Paid: full history, no date filter
- `listening_by_show` (top shows, episodes completed) is always all-time for everyone — no time dimension

**Stats page shows (using current + new data):**
- Streak (already computed in profile, now from real `listening_daily` data)
- Hours listened (30-day free / all-time paid, from `listening_daily`)
- Listening by day of week (bar chart, from `listening_daily`)
- Monthly trend (from `listening_daily`)
- Top shows by listening time (from `listening_by_show`)
- Episodes completed per show (from `listening_by_show`)

**Cut from original plan:** streak calendar visualization, episodes completed milestones.

- [x] Migration: `listening_daily` + `listening_by_show` tables
- [x] Update `POST /api/progress` to upsert into both tables on every save
- [x] Update `GET /api/profile`: replace expensive `playback_progress` aggregations for `listeningSeconds` and `streakDays` with queries against new tables (`completedThisWeek` stays on `playback_progress`)
- [x] Create `/stats` route
- [x] Link from Profile page

### 7. Skip Intro/Outro
~~Configurable per-podcast auto-skip.~~ **Deprioritized.** Not meaningfully requested by users; ineffective against dynamically inserted ads (position varies per stream). Only helps with consistent intro jingles — a narrow use case that doesn't justify the settings surface.

---

## Medium Wins

### 8. Smart Playlist Filters
Extend playlists with optional filter rules that auto-populate episodes: "unplayed from these shows," "under 20 min," "published in last 7 days," etc. Gate on paid tier.
- [ ] Design filter schema (JSON column on `playlists` table)
- [ ] Add filter builder UI to playlist creation/edit modal
- [ ] Server-side: evaluate filter rules and return matching episodes
- [ ] Auto-refresh smart playlists on open
- [ ] Gate behind paid tier

### 9. Episode Search Across Subscriptions
Full-text search over episode titles and descriptions across all subscribed shows. Query `episodes` table filtered to user's `subscriptions`.
- [ ] Add `tsvector` index on `episodes.title` + `episodes.description`
- [ ] Create `GET /api/episodes/search?q=` API route (auth-required)
- [ ] Add search UI (accessible from sidebar or discover page)
- [ ] Show results grouped by podcast with play/queue actions

### 10. Timestamp Links + Clip Sharing
Shareable deep-links into a specific moment: `/podcast/[id]?episode=[guid]&t=3600`. The public podcast page reads `?t=` and seeks to that position on load.
- [ ] Handle `?episode` + `?t` params on podcast detail page — auto-open and seek to timestamp
- [ ] Add "Share moment" button in player that copies a timestamped URL to clipboard
- [ ] (Paid) Generate shareable clip card with episode artwork + timestamp

### 11. Year-in-Review / Wrapped Stats
Annual or quarterly "Your [Year] in Podcasts" page with shareable card: total hours, top 5 shows, episodes completed, streak record, most-listened genre. Driven by existing `playback_progress` data.
- [ ] Build stats aggregation query (yearly/quarterly)
- [ ] Design shareable card UI (canvas or CSS screenshot)
- [ ] Add entry point from Profile or Stats page
- [ ] Trigger annually or on demand

### 12. Subscription-Based Recommendations on Discover
Use the user's subscribed feeds as seeds for `/api/podcasts/similar` to generate a personalized "Recommended for you" section on the Discover page.
- [ ] Add `GET /api/podcasts/recommended` — samples N subscribed shows, calls `/similar` for each, deduplicates
- [ ] Add "Recommended for you" section to Discover page (auth-only, below trending)
- [ ] Cache per-user, invalidate on `subscriptions-changed`

### 13. PWA / Offline Support
Service worker with episode audio caching. Lets users listen without connectivity and feels more native on mobile web.
- [ ] Add `next-pwa` or manual service worker via `public/sw.js`
- [ ] Cache static assets + episode audio on "Download" action
- [ ] Offline fallback page
- [ ] Add to home screen manifest + icons

---

## Hard Wins

### 14. Video Podcast Support
Support video RSS feeds (`<enclosure type="video/mp4">`) and render a video player instead of audio. Needed as YouTube takes 39% of podcast consumption.
- [ ] Detect video enclosures in feed parser
- [ ] Add video player component (HTML5 `<video>` with same controls UI)
- [ ] Handle mixed audio/video podcast feeds
- [ ] Store `media_type` in `episodes` table

---

## Prioritization Summary

| # | Win | Effort | Impact | Status |
|---|-----|--------|--------|--------|
| 1 | Similar podcasts UI | XS | Medium | ~~Now~~ Done |
| 2 | Per-show speed memory | XS | Medium | ~~Now~~ Done |
| 3 | Undo accidental skip | XS | Medium | ~~Now~~ Done |
| 4 | Settings page | S | High | ~~Now~~ Done |
| 5 | Notification settings UI | S | Medium | ~~Soon~~ Done |
| 6 | Stats page | S | High | ~~Soon~~ Done |
| 7 | Skip intro/outro | S | Low | Deprioritized — ineffective against DAI ads; only useful for consistent intro jingles |
| 8 | Smart playlist filters | M | High | Next sprint |
| 9 | Episode search across subs | M | High | Next sprint |
| 10 | Timestamp/clip sharing | M | High | Next sprint |
| 11 | Year-in-review stats | M | High | Seasonal |
| 12 | Subscription-based recs | M | High | Next sprint |
| 13 | PWA/offline | L | High | Q2 |
| 14 | Video podcast support | XL | Very High | Long-term |
| — | Transcript pipeline (T1–T4) | M→XL | High | See long-term.md |
| — | Social follow graph | XL | High | See long-term.md |
