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
`episodes` is written to by two routes — `POST /api/queue` and `POST /api/progress`. Neither creates episodes upfront; they upsert metadata alongside the user action. This means an episode row exists only after at least one user has interacted with it.

### Artwork URL priority
When returning queue or history items, the API always prefers `subscriptions.artwork_url` over `episodes.artwork_url`. iTunes CDN URLs are stable and don't have hotlink restrictions; RSS artwork URLs often do.

### Ordering
Both `subscriptions.position` and `queue.position` are maintained client-side via drag-drop and persisted via `PATCH` endpoints that accept a full ordered list and run parallel updates.

### Trigger: `on_auth_user_created`
Fires `AFTER INSERT ON auth.users`, calls `handle_new_user()`, which inserts a `user_profiles` row with `tier = 'free'`. This ensures every user always has a profile row.
