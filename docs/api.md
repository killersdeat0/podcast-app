# API Routes

All routes under `src/app/api/`. Every route requires an authenticated Supabase session via cookie (server client) unless noted otherwise.

---

## Podcast Discovery

### `GET /api/podcasts/search?q=<term>`
Proxies the iTunes Search API. No auth required.

**Response:**
```json
{ "results": [{ "collectionId": 123, "collectionName": "...", "artworkUrl600": "...", "feedUrl": "..." }] }
```

---

### `GET /api/podcasts/feed?url=<feedUrl>`
Fetches and parses an RSS feed server-side. No auth required.

**Response:** Parsed feed object with `title`, `artworkUrl`, `episodes[]` (see `src/lib/rss/parser.ts` for full shape).

**Errors:** `400` if `url` missing, `502` if feed fails to parse.

---

### `GET /api/podcasts/chapters?url=<chapterUrl>`
Fetches a Podcast Namespace JSON chapter file.

**Response:** `{ chapters: [{ startTime: number, title?: string }] }`

---

### `GET /api/podcasts/episodes?collectionId=<id>`
Proxies the iTunes Lookup API to fetch up to 200 episodes for a podcast. No auth required. Results are cached for 1 hour (`revalidate: 3600`).

**Response:** Array of iTunes episode objects with fields: `trackId`, `episodeGuid?`, `trackName`, `releaseDate`, `trackTimeMillis`, `episodeUrl`, `description?`

**Errors:** `400` if `collectionId` missing, `502` if iTunes lookup fails.

**Note:** Only works when the podcast has a numeric iTunes `collectionId`. Used client-side to power episode search — fetched lazily on first keystroke, then merged with the already-loaded RSS `feed.episodes` client-side (dedup by guid, RSS wins on collision) via `src/lib/episodes/mergeEpisodeSources.ts`. This means search covers both the iTunes-indexed episodes (up to 200) and whatever the RSS feed currently exposes. RSS results appear immediately; the "Loading more…" indicator shows while iTunes is in flight.

---

### `GET /api/podcasts/unseen?feedUrl=<url>&since=<isoDate>`
Returns episodes stored in the `episodes` DB cache for a given feed that have a `pub_date` newer than `since`. Used by the podcast detail page to supplement the current RSS feed with episodes that may have aged out of the feed's retention window.

**Auth required.** Requires a valid user session.

**Query params:**
- `feedUrl` — the podcast feed URL
- `since` — ISO 8601 timestamp (the user's `last_visited_at`)

**Response:** Array of episode objects: `guid`, `title`, `audio_url`, `pub_date`, `duration`, `description`, `artwork_url`, `chapter_url`

**Errors:** `400` if either param is missing, `500` on DB error.

---

### `GET /api/podcasts/trending?genreId=<genreId>`
Returns trending/popular podcasts. No auth required.

Without `genreId` (or `genreId=0`): fetches Apple Top Charts, then enriches via iTunes Lookup API.
With a positive `genreId`: fetches popular podcasts in that genre via iTunes Search API.

Genre IDs: 1303 Comedy, 1318 Technology, 1489 News, 1488 True Crime, 1321 Business, 1304 Education, 1324 Society & Culture, 1545 Sports, 1512 Health & Fitness.

**Response:**
```json
{ "results": [{ "collectionId": 123, "collectionName": "...", "artworkUrl600": "...", "feedUrl": "..." }] }
```

---

## Subscriptions

### `GET /api/subscriptions`
Returns all subscriptions for the user, ordered by `position` ascending.

**Response:** Array of subscription rows.

---

### `POST /api/subscriptions`
Subscribe to a podcast.

**Body:** `{ feedUrl, title, artworkUrl, collectionId? }`

**Response:** `{ ok: true }`

---

### `DELETE /api/subscriptions`
Unsubscribe from a podcast.

**Body:** `{ feedUrl }`

**Response:** `{ ok: true }`

---

### `POST /api/subscriptions/refresh`
Background feed refresh. Fetches RSS for all subscriptions where `last_feed_checked_at` is null or older than 1 hour, recomputes `new_episode_count` and `latest_episode_pub_date` for each, and returns the full updated subscription list.

**Episode filter logic** (mirrors podcast detail page):
- Free users: `episode_filter = ''` → 0 count; anything else → count all new episodes since `last_visited_at`
- Paid users: `episode_filter = null` → 0; `'*'` → all new; any other text → filtered by episode title keyword

Feeds are fetched in parallel capped at 10 concurrent. Individual feed failures are silently skipped. The client (Sidebar) gates calls with a `localStorage` key `feed_refresh_last_called` to avoid calling more than once per hour across tabs. The `setInterval` in the Sidebar also re-fires this every hour while the tab stays open.

**Response:** `{ subscriptions: SubscriptionRow[] }` — same shape as `GET /api/subscriptions`

---

### `PATCH /api/subscriptions`
Two body variants:

**Body A — Reorder:** `{ orderedFeedUrls: string[] }` — full ordered list of feed URLs. Runs parallel updates setting `position = index` for each.

**Body B — Visit tracking / episode filter:** `{ feedUrl: string, latestEpisodePubDate?: string, lastVisitedAt?: string, newEpisodeCount?: number, episodeFilter?: string, newEpisodesToCache?: EpisodeCache[] }`
- `latestEpisodePubDate`: set on podcast detail page mount (after feed fetch) to the newest episode's `pubDate`
- `lastVisitedAt`: set on podcast detail page unmount to record when the user last visited
- `newEpisodeCount`: count of new episodes since last visit; set on mount alongside `latestEpisodePubDate`
- `episodeFilter`: controls the ✨ New Episodes section. Sentinel values: `''` = no notifications (all users), `'*'` = all new episodes (all users), any other text = custom keyword filter (paid only — free users who send custom text are silently ignored). On downgrade, custom text filters are automatically reset to `'*'`.
- `newEpisodesToCache`: array of new episode metadata `{ guid, title, audioUrl, pubDate, duration, description, artworkUrl, podcastTitle }` to upsert into the shared `episodes` table. This ensures new episodes remain queryable via `GET /api/podcasts/unseen` even after they age out of the RSS feed's retention window. Uses `{ onConflict: 'feed_url,guid' }`. Empty array is a no-op.

**Response:** `{ ok: true }`

---

## Queue

### `GET /api/queue`
Returns the user's queue ordered by `position`, with episode metadata joined from `episodes` table. Falls back to `subscriptions.artwork_url` for artwork.

**Response:**
```json
[{ "episode_guid": "...", "feed_url": "...", "position": 0, "episode": { "title": "...", "audio_url": "...", "duration": 3600, "artwork_url": "...", "podcast_title": "..." } }]
```

---

### `POST /api/queue`
Add an episode to the queue. Upserts episode metadata into `episodes` first.

**Freemium gate:** Free tier is capped at 10 queue items. Returns `403` with `"Queue limit reached. Upgrade to add more episodes."` if at cap.

**Body:** `{ guid, feedUrl, title, audioUrl, artworkUrl, podcastTitle, duration?, pubDate?, description? }`

**Response:** `{ ok: true }`

---

### `DELETE /api/queue`
Remove an episode from the queue.

**Body:** `{ guid }`

**Response:** `{ ok: true }`

---

### `PATCH /api/queue`
Reorder the queue after drag-drop.

**Body:** `{ orderedGuids: string[] }` — full ordered list.

**Response:** `{ ok: true }`

---

## Playback Progress

### `GET /api/progress?guid=<guid>&feedUrl=<feedUrl>`
Fetch saved position for an episode. Returns `{ positionSeconds: 0 }` for unauthenticated users or unknown episodes (no 401).

**Response:** `{ positionSeconds: number }`

---

### `GET /api/progress/completed?feedUrl=<feedUrl>`
Fetch playback progress for all episodes in a feed that have been listened to (`position_seconds > 0`). Used by the podcast page to show played/partial indicators. Returns `{ progress: [] }` for unauthenticated users or missing `feedUrl` (no 401).

**Response:** `{ progress: Array<{ guid: string, positionSeconds: number, completed: boolean }> }`

---

### `POST /api/progress`
Save playback position. Also upserts episode metadata into `episodes` if `title` and `audioUrl` are provided.

**Body:** `{ guid, feedUrl, positionSeconds, completed?, title?, audioUrl?, duration?, artworkUrl?, podcastTitle? }`

**Response:** `{ ok: true }`

---

## History

### `GET /api/history`
Returns all episodes where `position_seconds > 0`, ordered by `updated_at` descending. Joins episode metadata and falls back to `subscriptions.artwork_url` for artwork.

**Freemium gate:** Free tier filters to last 30 days (`updated_at >= now - 30 days`). Paid tier returns full history.

**Response:** Same shape as queue items, but with progress fields (`position_seconds`, `completed`, `updated_at`) instead of `position`.

---

## Profile

### `GET /api/profile`
Returns the current user's profile and listening stats.

**Response:** `{ email, tier, listeningSeconds, completedThisWeek, streakDays }`

- `listeningSeconds` — sum of `position_seconds` from `playback_progress` in the last 30 days
- `completedThisWeek` — count of episodes marked `completed = true` in the last 7 days (paid-only display)
- `streakDays` — consecutive days with any listening activity; starts from today, falls back to yesterday if no activity yet today (paid-only display)

---

## OPML

### `GET /api/opml/export`
Exports the user's subscriptions as an OPML 2.0 file.

**Response:** `text/xml` file download (`subscriptions.opml`) containing one `<outline type="rss">` per subscription.

---

### `POST /api/opml/import`
Imports subscriptions from an OPML file. Accepts `multipart/form-data` with a `file` field.

Fetches each RSS feed in parallel to resolve the canonical title and artwork URL. Skips feeds that already exist in the user's subscriptions (`ignoreDuplicates: true`). Capped at 200 feeds per import.

**Response:** `{ imported: number }` — count of feeds added.

**Errors:** `400` if no file, unparseable XML, or no feeds found. `401` if unauthenticated.

---

## Dev (development only)

Routes that return `404` in production.

### `POST /api/dev/upgrade`
Sets the current user's `tier` to `'paid'` without going through Stripe. Used for fast testing of paid features.

**Response:** `{ ok: true }`

---

### `POST /api/dev/downgrade`
Sets the current user's `tier` to `'free'` and clears `stripe_subscription_id`. Also resets any custom text `episode_filter` values on the user's subscriptions back to `'*'`.

**Response:** `{ ok: true }`

---

### `POST /api/dev/reset-last-visited`
Sets `last_visited_at` to 7 days ago, `new_episode_count` to 0, and `last_feed_checked_at` to null on all of the user's subscriptions. Nulling `last_feed_checked_at` forces the next `POST /api/subscriptions/refresh` call to re-fetch all feeds. The profile page clears the `localStorage` gate and immediately calls the refresh endpoint after this, so badges recompute without a page reload.

**Response:** `{ ok: true }`

---

## Stripe / Payments

### `POST /api/stripe/checkout`
Creates a Stripe Checkout session. Looks up or creates a Stripe customer for the user.

**Body:** `{ priceId: string }` — must be a valid Stripe price ID.

**Response:** `{ url: string }` — redirect to Stripe hosted checkout page.

**Errors:** `401` if not authenticated, `400` if `priceId` missing.

---

### `POST /api/stripe/webhook`
Stripe webhook receiver. Verifies signature using `STRIPE_WEBHOOK_SECRET`.

**Handled events:**
- `customer.subscription.created` / `customer.subscription.updated` — sets `user_profiles.tier` to `'paid'` (or `'free'` if status is not active/trialing)
- `customer.subscription.deleted` — sets tier to `'free'`, clears `stripe_subscription_id`

All other events are acknowledged and ignored.

**Auth:** Not session-based — uses Stripe signature verification. Raw body must not be parsed before this route receives it (`export const dynamic = 'force-dynamic'`).
