# PodSync — Setup Guide

## Overview

PodSync is a web podcast app built with Next.js 16, Supabase, and Stripe. Users can search/subscribe to podcasts, play episodes, manage a queue, and track listening history. A freemium model gates advanced features behind a $4.99/month or $50/year subscription.

---

## Local Development

### Prerequisites
- Node.js 18+
- Supabase CLI (`brew install supabase/tap/supabase`)
- Stripe CLI (for webhook testing)

### 1. Clone and install
```bash
git clone https://github.com/killersdeat0/podcast-app.git
cd podcast-app
npm install
```

### 2. Configure environment
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://nuvadoybccdqipyhdhns.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Stripe (required for subscription payments)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_MONTHLY_PRICE_ID=
STRIPE_YEARLY_PRICE_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID=
NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID=

# E2E tests
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
```

### 3. Run
```bash
npm run dev
```

---

## Supabase Setup

### Recreating from scratch
The entire DB schema and RLS policies are in `supabase/migrations/`. Auth config is in `supabase/config.toml`.

```bash
supabase link --project-ref <project-ref>
supabase db push       # applies all migrations
supabase config push   # applies auth/config settings
```

### Auth configuration
- Email/password signup: enabled
- Google OAuth: enabled — requires `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` set in Supabase dashboard (Secrets)
- Redirect URLs: add `http://localhost:3000/auth/callback` and your production URL (e.g. `https://yourapp.vercel.app/auth/callback`) in Supabase → Authentication → URL Configuration

### Google OAuth setup
1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
4. Copy client ID and secret → Supabase dashboard → Authentication → Providers → Google

### Database schema
| Table | Purpose |
|---|---|
| `user_profiles` | Extends auth.users — stores tier (`free`/`paid`), `stripe_customer_id`, `stripe_subscription_id` |
| `subscriptions` | Podcast subscriptions per user, with drag-drop `position` |
| `episodes` | Shared episode metadata cache (upserted on queue add or progress save) |
| `playback_progress` | Per-user playback position + completion status |
| `queue` | Ordered episode queue per user |
| `favorites` | Saved episodes (reserved for future use) |
| `downloads` | Download records (mobile, Phase 3) |

A trigger (`on_auth_user_created`) automatically creates a `user_profiles` row on signup.

---

## Stripe Setup

1. Create a [Stripe account](https://stripe.com)
2. Products → Create product → Add two prices:
   - Monthly recurring: $4.99/month → copy ID to `STRIPE_MONTHLY_PRICE_ID` + `NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID`
   - Annual recurring: $50/year → copy ID to `STRIPE_YEARLY_PRICE_ID` + `NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID`
3. Developers → API keys → copy publishable + secret keys to `.env.local`
4. Developers → Webhooks → Add endpoint:
   - URL: `https://yourapp.vercel.app/api/stripe/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy signing secret to `STRIPE_WEBHOOK_SECRET`

### Local webhook testing
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the whsec_... secret it prints into STRIPE_WEBHOOK_SECRET in .env.local
```

---

## Deployment (Vercel)

1. Import GitHub repo at vercel.com
2. Add all env vars from `.env.local` to Vercel → Settings → Environment Variables
3. Deploy — auto-deploys on every push to `main`
4. Update Supabase redirect URLs to include the Vercel URL
5. Add production Stripe webhook endpoint pointing to the Vercel URL

---

## Testing

```bash
npm test -- --run      # unit tests (Vitest)
npm run test:e2e       # Playwright E2E (requires dev server + E2E_TEST_* env vars)
npm run test:e2e -- --headed --slow-mo=500  # watch mode
```

E2E tests require `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` set to a real Supabase account (email/password auth — Google OAuth cannot be automated).

---

## Freemium Tier Gates

| Feature | Free | Paid |
|---|---|---|
| Queue size | 10 episodes | Unlimited |
| Playback speed | 1x, 2x only | Full range (0.5x–3x) |
| Speed preference | Resets to 1x each session | Persisted across sessions (`localStorage`) |
| History | Last 30 days | Full history |
| Notifications | Per-podcast toggle | + name pattern filters |
| Ads | Banner + audio ad between episodes | None |
| Silence skipping | ✗ | ✓ |
| Listening stats | ✗ | ✓ |
| OPML import/export | ✓ | ✓ |

A nightly pg_cron job (03:00 UTC) deletes `playback_progress` rows older than 30 days for all free-tier users. This covers both always-free users and lapsed paid users (who are downgraded to free by the Stripe webhook).
