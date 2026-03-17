# Screen: Notification Settings

> Source: [`docs/plans/phase-3b-mobile-features.md`](../phase-3b-mobile-features.md)

## Description
Fine-grained control over episode notifications, both globally and per podcast.

## Contents
- Master on/off toggle (disables all episode notifications)
- Per-podcast toggle list (mirrors the toggle on Podcast Detail)
- Episode filter patterns section (paid — filter by title keyword/regex to suppress spoilers etc.)

## Navigation
- **Arrives from:** Settings · Podcast Detail (per-podcast notification toggle)
- **Goes to:** Upgrade Sheet (free: episode filter patterns)

## Feature Gates
| Element | Free | Paid |
|---------|------|------|
| Master toggle | ✓ | ✓ |
| Per-podcast toggles | ✓ | ✓ |
| Episode filter patterns | — | ✓ |

## Implementation

| File | Source Set |
|------|------------|
| `notifications/NotificationSettingsFeature.kt` | `commonMain` |
| `notifications/NotificationSettingsScreen.kt` | `commonMain` |
| `notifications/NotificationSettingsViewModel.kt` | `androidMain` |

**Key logic:** Per-podcast toggles write to a `notification_prefs` table (or a `notifications_enabled` column on `subscriptions`). Episode filter patterns stored as a JSON array per user in Supabase. Push delivery is handled by the Supabase Edge Function cron that checks `last_feed_checked_at`.
