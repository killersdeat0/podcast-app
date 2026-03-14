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

### `PATCH /api/subscriptions`
Update drag-drop order.

**Body:** `{ orderedFeedUrls: string[] }` — full ordered list of feed URLs.

Runs parallel updates setting `position = index` for each.

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
