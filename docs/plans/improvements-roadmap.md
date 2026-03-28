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

### 5. Notification Settings UI Per Podcast
`episode_filter` column already exists in DB. Add a settings popover on the podcast detail page / subscription list to configure per-podcast new-episode notifications.
- [ ] Add notification settings UI to podcast detail page (popover or inline toggle)
- [ ] Wire to existing `episode_filter` column via `PATCH /api/subscriptions`
- [ ] Gate `*` (all episodes) on paid tier

### 6. Dedicated Stats Page
All data already tracked in `playback_progress`. Expand profile stats into a full `/stats` page.
- [ ] Create `/stats` route
- [ ] Top shows by listening time
- [ ] Listening by day of week (bar chart)
- [ ] Monthly listening trend
- [ ] Streak calendar visualization
- [ ] Episodes completed milestones
- [ ] Link from Profile page

### 7. Skip Intro/Outro
Configurable per-podcast auto-skip: "skip first N seconds / skip last N seconds." Store in subscription settings; Player reads it on episode load.
- [ ] Add `intro_skip_seconds` + `outro_skip_seconds` to subscriptions table (migration)
- [ ] Add UI to podcast detail page to configure per-show skip
- [ ] Apply auto-seek in Player on episode load

---

## Medium Wins

### 8. Podcasting 2.0 Transcript Support
Parse `<podcast:transcript>` tags from RSS feeds (`.srt`, `.vtt`, `.json` formats). Return transcript URL from feed API. Render a scrolling, tap-to-seek transcript panel in the player.
- [ ] Parse `<podcast:transcript>` in `supabase/functions/podcasts-feed`
- [ ] Return `transcriptUrl` + `transcriptType` in feed API response
- [ ] Add transcript panel UI to Player (collapsible, synced scroll, tap-to-seek)
- [ ] Add i18n strings for transcript UI

### 9. Smart Playlist Filters
Extend playlists with optional filter rules that auto-populate episodes: "unplayed from these shows," "under 20 min," "published in last 7 days," etc. Gate on paid tier.
- [ ] Design filter schema (JSON column on `playlists` table)
- [ ] Add filter builder UI to playlist creation/edit modal
- [ ] Server-side: evaluate filter rules and return matching episodes
- [ ] Auto-refresh smart playlists on open
- [ ] Gate behind paid tier

### 10. Episode Search Across Subscriptions
Full-text search over episode titles and descriptions across all subscribed shows. Query `episodes` table filtered to user's `subscriptions`.
- [ ] Add `tsvector` index on `episodes.title` + `episodes.description`
- [ ] Create `GET /api/episodes/search?q=` API route (auth-required)
- [ ] Add search UI (accessible from sidebar or discover page)
- [ ] Show results grouped by podcast with play/queue actions

### 11. Timestamp Links + Clip Sharing
Shareable deep-links into a specific moment: `/podcast/[id]?episode=[guid]&t=3600`. The public podcast page reads `?t=` and seeks to that position on load.
- [ ] Handle `?episode` + `?t` params on podcast detail page — auto-open and seek to timestamp
- [ ] Add "Share moment" button in player that copies a timestamped URL to clipboard
- [ ] (Paid) Generate shareable clip card with episode artwork + timestamp

### 12. Year-in-Review / Wrapped Stats
Annual or quarterly "Your [Year] in Podcasts" page with shareable card: total hours, top 5 shows, episodes completed, streak record, most-listened genre. Driven by existing `playback_progress` data.
- [ ] Build stats aggregation query (yearly/quarterly)
- [ ] Design shareable card UI (canvas or CSS screenshot)
- [ ] Add entry point from Profile or Stats page
- [ ] Trigger annually or on demand

### 13. Subscription-Based Recommendations on Discover
Use the user's subscribed feeds as seeds for `/api/podcasts/similar` to generate a personalized "Recommended for you" section on the Discover page.
- [ ] Add `GET /api/podcasts/recommended` — samples N subscribed shows, calls `/similar` for each, deduplicates
- [ ] Add "Recommended for you" section to Discover page (auth-only, below trending)
- [ ] Cache per-user, invalidate on `subscriptions-changed`

### 14. PWA / Offline Support
Service worker with episode audio caching. Lets users listen without connectivity and feels more native on mobile web.
- [ ] Add `next-pwa` or manual service worker via `public/sw.js`
- [ ] Cache static assets + episode audio on "Download" action
- [ ] Offline fallback page
- [ ] Add to home screen manifest + icons

---

## Hard Wins

### 15. AI-Generated Transcripts (On-Demand)
For episodes without a Podcasting 2.0 transcript tag, generate transcripts on-demand via Deepgram or Whisper. Cache in Supabase Storage. Gate behind paid tier.
- [ ] Create `POST /api/episodes/transcript` route — submits audio URL to transcription API
- [ ] Store result in Supabase Storage keyed by `feed_url + guid`
- [ ] Return cached transcript if exists, else queue generation
- [ ] Add "Generate transcript" button in player (paid gate)
- [ ] Reuse transcript panel UI from item 8

### 16. Transcript Full-Text Search
Once transcripts exist (items 8 + 15), index them and enable cross-library search: "find every episode where someone mentioned X."
- [ ] Index transcript content in Postgres `tsvector` or pgvector
- [ ] Extend episode search (item 10) to include transcript matches
- [ ] Show matched transcript excerpt + timestamp in results
- [ ] Tap result to seek to that moment in episode

### 17. AI Episode Summaries + Auto-Chapters
Pre-listen: "Here's what this 90-minute episode covers in 3 bullets." Auto-chapters from transcript. Requires transcript pipeline (items 8/15).
- [ ] Generate summary from transcript via LLM (Claude API)
- [ ] Generate chapter markers from transcript structure
- [ ] Display summary in episode modal / player before play
- [ ] Cache summaries in DB; invalidate rarely

### 18. Video Podcast Support
Support video RSS feeds (`<enclosure type="video/mp4">`) and render a video player instead of audio. Needed as YouTube takes 39% of podcast consumption.
- [ ] Detect video enclosures in feed parser
- [ ] Add video player component (HTML5 `<video>` with same controls UI)
- [ ] Handle mixed audio/video podcast feeds
- [ ] Store `media_type` in `episodes` table

### 19. Social / Follow Graph
Follow other users, see a listening activity feed, get recommendations from people you trust. Needs critical mass to be useful.
- [ ] `user_follows` table (follower/following)
- [ ] Opt-in public listening activity
- [ ] Activity feed page (who listened to what)
- [ ] Follow-based recommendation surface on Discover
- [ ] Privacy controls (public/friends/private)

---

## Prioritization Summary

| # | Win | Effort | Impact | Status |
|---|-----|--------|--------|--------|
| 1 | Similar podcasts UI | XS | Medium | ~~Now~~ Done |
| 2 | Per-show speed memory | XS | Medium | ~~Now~~ Done |
| 3 | Undo accidental skip | XS | Medium | ~~Now~~ Done |
| 4 | Settings page | S | High | ~~Now~~ Done |
| 5 | Notification settings UI | S | Medium | Soon |
| 6 | Stats page | S | High | Soon |
| 7 | Skip intro/outro | S | High | Soon |
| 8 | Podcasting 2.0 transcripts | M | Very High | Next sprint |
| 9 | Smart playlist filters | M | High | Next sprint |
| 10 | Episode search across subs | M | High | Next sprint |
| 11 | Timestamp/clip sharing | M | High | Next sprint |
| 12 | Year-in-review stats | M | High | Seasonal |
| 13 | Subscription-based recs | M | High | Next sprint |
| 14 | PWA/offline | L | High | Q2 |
| 15 | AI transcripts (on-demand) | L | Very High | Q2–Q3 |
| 16 | Transcript full-text search | L | Very High | After 15 |
| 17 | AI summaries + chapters | L | High | After 15 |
| 18 | Video podcast support | XL | Very High | Long-term |
| 19 | Social follow graph | XL | High | Long-term |
