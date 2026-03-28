# Data Model

Schema lives in `supabase/migrations/`. All tables have Row Level Security (RLS) enabled.

---

## Tables

### `user_profiles`
Extends `auth.users`. Created automatically by the `on_auth_user_created` trigger on signup.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK | References `auth.users(id)`, cascades on delete |
| `tier` | `text` | `'free'` or `'paid'`, default `'free'` |
| `stripe_customer_id` | `text` | Set on first Stripe checkout |
| `stripe_subscription_id` | `text` | Set by webhook on subscription create/update |
| `created_at` | `timestamptz` | Auto-set |

**RLS:** Users can read/write only their own row (`auth.uid() = user_id`).

---

### `subscriptions`
One row per user per podcast they're subscribed to.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | References `auth.users(id)` |
| `feed_url` | `text` | RSS feed URL — primary identifier for a podcast |
| `title` | `text` | Podcast title |
| `artwork_url` | `text` | iTunes CDN URL (preferred over RSS artwork — many podcasts block hotlinking) |
| `collection_id` | `text` | iTunes collection ID (optional) |
| `position` | `integer` | Drag-drop order, 0-indexed |
| `subscribed_at` | `timestamptz` | Auto-set |
| `last_visited_at` | `timestamptz` | When user last opened this podcast's detail page (set on unmount) |
| `latest_episode_pub_date` | `timestamptz` | Newest episode `pubDate` from the last feed fetch (set on mount) |
| `episode_filter` | `text` | Controls the ✨ New Episodes section. Sentinels: `''` = no notifications (all users), `'*'` = all new episodes (all users), any other text = custom keyword filter (paid only). On downgrade, custom text is reset to `'*'`. |
| `new_episode_count` | `integer` | Count of new episodes since last visit; set on podcast detail page mount, reset to 0 on unmount; drives count badge in sidebar and profile |
| `last_feed_checked_at` | `timestamptz` | When the feed was last checked for new episodes by `POST /api/subscriptions/refresh`. Used as the server-side staleness gate (skip re-fetch if checked within the last hour). Nulled by the dev reset route to force a re-check. |

**Unique constraint:** `(user_id, feed_url)`

**RLS:** Users can manage only their own rows.

---

### `episodes`
Shared episode metadata cache. Not per-user — any authenticated user can read/write. Episode rows are upserted whenever a user saves progress or adds to queue, so the same episode is only stored once regardless of how many users interact with it.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `feed_url` | `text` | |
| `guid` | `text` | RSS `<guid>` — unique per episode within a feed |
| `title` | `text` | |
| `audio_url` | `text` | |
| `duration` | `integer` | Seconds |
| `pub_date` | `timestamptz` | |
| `description` | `text` | |
| `chapter_url` | `text` | Podcast Namespace JSON chapters URL |
| `artwork_url` | `text` | |
| `podcast_title` | `text` | |

**Unique constraint:** `(feed_url, guid)` — always use `{ onConflict: 'feed_url,guid' }` when upserting.

**RLS:** Any authenticated user can select, insert, or update.

---

### `playback_progress`
Stores the last known playback position per user per episode. Also serves as the history source.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `episode_guid` | `text` | |
| `feed_url` | `text` | |
| `position_seconds` | `integer` | Last saved position |
| `completed` | `boolean` | Set to `true` when episode ends |
| `updated_at` | `timestamptz` | Updated on every progress save |

**Unique constraint:** `(user_id, episode_guid)`

**RLS:** Users can manage only their own rows.

**Cleanup:** A nightly pg_cron job (03:00 UTC) deletes rows older than 30 days for all `tier = 'free'` users. See `supabase/migrations/20260315000001_cron_cleanup_free_history.sql`.

---

### `queue`
Ordered list of episodes the user wants to listen to next.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `episode_guid` | `text` | |
| `feed_url` | `text` | |
| `position` | `integer` | 0-indexed play order |
| `added_at` | `timestamptz` | |

**Unique constraint:** `(user_id, episode_guid)` — prevents duplicates.

**RLS:** Users can manage only their own rows.

---

### `playlists`
Named, reusable episode lists (see `docs/playlists.md`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users (cascade delete) |
| `name` | text | required |
| `description` | text | optional |
| `is_public` | boolean | default false |
| `position` | integer | drag-drop order |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-updated via trigger (`set_updated_at`) |

**RLS:** Owner full access. Authenticated users can SELECT `is_public = true` rows. No anonymous policy — public reads use `createAdminClient()`.

---

### `playlist_episodes`
Episodes within a playlist.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `playlist_id` | uuid | FK → playlists (cascade delete) |
| `episode_guid` | text | |
| `feed_url` | text | |
| `position` | integer | sort order |
| `added_at` | timestamptz | |

Unique: `(playlist_id, episode_guid)`.

**RLS:** Owner can manage via parent playlist ownership. Authenticated users can read episodes of public playlists. No anonymous policy.

---

### `listening_daily`
One row per user per calendar day (UTC). Upserted on every `POST /api/progress` save.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK | References `auth.users(id)`, cascades on delete |
| `date` | `date` PK | UTC calendar date (`YYYY-MM-DD`) |
| `seconds_listened` | `integer` | Cumulative seconds listened on this day |

**Primary key:** `(user_id, date)`

**Write strategy:** On every progress save, compute `timeSinceLastSave = now - prevProgress.updated_at`, then `secondsListened = min(timeSinceLastSave, 15)`. Using wall-clock elapsed time (not position delta) means forward skips and playback speed don't inflate stats — stats reflect real time spent listening. The 15s cap absorbs timing jitter on pause/resume. Saves only fire while audio is playing so pauses are naturally excluded. If no previous row exists, skip the stats upsert.

**RLS:** Users can manage only their own rows.

---

### `listening_by_show`
One row per user per podcast feed. Upserted on every `POST /api/progress` save.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK | References `auth.users(id)`, cascades on delete |
| `feed_url` | `text` PK | RSS feed URL |
| `seconds_listened` | `integer` | Cumulative seconds listened for this show |
| `episodes_completed` | `integer` | Count of distinct episodes completed (false→true transitions only) |
| `last_listened_at` | `timestamptz` | Timestamp of most recent progress save |

**Primary key:** `(user_id, feed_url)`

**Write strategy:** Same `secondsListened` calculation as `listening_daily`. If `secondsListened > 0`, increment `seconds_listened` and update `last_listened_at`. Increment `episodes_completed` by 1 only on a `false→true` completion transition (prevents double-counting). When `secondsListened = 0` but a new completion is detected, only `episodes_completed` is incremented.

**RLS:** Users can manage only their own rows.

---

### `favorites`
Reserved for future use.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `episode_guid` | `text` | |
| `feed_url` | `text` | |
| `added_at` | `timestamptz` | |

---

### `downloads`
Reserved for mobile (Phase 3). Tracks downloaded episode files.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `episode_guid` | `text` | |
| `feed_url` | `text` | |
| `stored_url` | `text` | Path to locally stored file |
| `downloaded_at` | `timestamptz` | |

---

## Key Patterns

### Episode upsert cache
`episodes` is written to by three routes:
- `POST /api/queue` — upserts episode metadata when a user adds to queue
- `POST /api/progress` — upserts episode metadata when progress is saved
- `PATCH /api/subscriptions` (via `newEpisodesToCache`) — upserts new episode metadata on podcast detail page mount, so episodes are cached even before any user interaction. This ensures new episodes remain visible via `GET /api/podcasts/unseen` even after they age out of the RSS feed's retention window. Description is intentionally omitted from this cache path (it's large and not needed for the new episodes UI); it gets filled in when a user queues or plays the episode.

### Artwork URL priority
When returning queue or history items, the API always prefers `subscriptions.artwork_url` over `episodes.artwork_url`. iTunes CDN URLs are stable and don't have hotlink restrictions; RSS artwork URLs often do.

### Ordering
Both `subscriptions.position` and `queue.position` are maintained client-side via drag-drop and persisted via `PATCH` endpoints that accept a full ordered list and run parallel updates.

### Trigger: `on_auth_user_created`
Fires `AFTER INSERT ON auth.users`, calls `handle_new_user()`, which inserts a `user_profiles` row with `tier = 'free'`. This ensures every user always has a profile row.
