# Long-Term Backlog

Features that are technically interesting but deprioritized due to low adoption, high complexity, or dependency on other systems not yet built. Revisit when there's strong user demand.

---

## Transcript Pipeline

These three items form a coherent pipeline and only make sense to build together. Parked because only ~8–15% of podcasts publish `<podcast:transcript>` tags, so Phase 1 (RSS transcripts) would cover a small minority of episodes — and Phase 2 (AI generation) is the piece that makes it broadly useful but is expensive and complex to operate.

### T1. Podcasting 2.0 Transcript Support
Parse `<podcast:transcript>` tags from RSS feeds (`.srt`, `.vtt`, `.json` formats). Return transcript URL from feed API. Render a scrolling, tap-to-seek transcript panel in the player.
- [ ] Parse `<podcast:transcript>` in `supabase/functions/podcasts-feed` (array — multiple formats per episode)
- [ ] Proxy transcript fetch via `GET /api/podcasts/transcript?url=` (avoids CORS, same pattern as chapters)
- [ ] Normalize all formats (VTT, SRT, Podcast Index JSON) to `{ cues: [{ startTime, endTime, text, speaker? }] }`
- [ ] Pick best format in `play()`: JSON → VTT → SRT
- [ ] Add `transcriptUrl` + `transcriptType` to `NowPlaying` shape
- [ ] Add transcript panel UI to Player (collapsible, synced scroll via `timeupdate`, tap-to-seek)
- [ ] Add i18n strings for transcript UI
- [ ] Tier gate: free users can view existing RSS transcripts; AI generation (T2) is paid-only

### T2. AI-Generated Transcripts (On-Demand)
For episodes without a Podcasting 2.0 transcript tag, generate transcripts on-demand via Deepgram or Whisper. Cache in Supabase Storage. Gate behind paid tier.
- [ ] Create `POST /api/episodes/transcript` route — submits audio URL to transcription API
- [ ] Store result in Supabase Storage keyed by `{feed_url_hash}/{guid}`
- [ ] Return cached transcript if exists, else generate synchronously (show loading state; most episodes < 60 min)
- [ ] Add "Generate transcript" button in player (paid gate)
- [ ] Reuse transcript panel UI from T1

### T3. Transcript Full-Text Search
Once transcripts exist (T1 + T2), index them and enable cross-library search: "find every episode where someone mentioned X."
- [ ] Index transcript content in Postgres `tsvector` or pgvector
- [ ] Extend episode search to include transcript matches
- [ ] Show matched transcript excerpt + timestamp in results
- [ ] Tap result to seek to that moment in episode

### T4. AI Episode Summaries + Auto-Chapters
Pre-listen: "Here's what this 90-minute episode covers in 3 bullets." Auto-chapters from transcript. Requires transcript pipeline (T1/T2).
- [ ] Generate summary from transcript via LLM (Claude API)
- [ ] Generate chapter markers from transcript structure
- [ ] Display summary in episode modal / player before play
- [ ] Cache summaries in DB; invalidate rarely

---

## Social / Follow Graph

Needs critical mass to be useful — only worth building once there's a meaningful user base.

### S1. Social / Follow Graph
Follow other users, see a listening activity feed, get recommendations from people you trust.
- [ ] `user_follows` table (follower/following)
- [ ] Opt-in public listening activity
- [ ] Activity feed page (who listened to what)
- [ ] Follow-based recommendation surface on Discover
- [ ] Privacy controls (public/friends/private)
