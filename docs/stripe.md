# Stripe / Payments

Handles subscription billing via Stripe Checkout. Routes live in `src/app/api/stripe/`.

## Environment variables

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_MONTHLY_PRICE_ID
STRIPE_YEARLY_PRICE_ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID
```

---

## Checkout flow

1. User visits `/upgrade` and clicks "Subscribe Monthly" or "Subscribe Annually"
2. Client calls `POST /api/stripe/checkout` with the relevant `priceId`
3. Server looks up or creates a Stripe customer for the user, then creates a hosted Checkout session
4. Client redirects to `session.url` (Stripe-hosted payment page)
5. On completion Stripe redirects to `/upgrade?success=true` or `/upgrade?cancelled=true`
6. Stripe fires a webhook → `POST /api/stripe/webhook` updates `user_profiles.tier`

---

## API routes

### `POST /api/stripe/checkout`

Creates a Stripe Checkout session. Auth required (Supabase session cookie).

**Body:** `{ priceId: string }` — must be a valid Stripe price ID (`NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID` or `NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID`).

**Behaviour:**
- Looks up `user_profiles.stripe_customer_id`; if absent, creates a new Stripe customer with `metadata.supabase_user_id` and stores the returned customer ID
- Creates a Checkout session in `subscription` mode with `success_url = /upgrade?success=true` and `cancel_url = /upgrade?cancelled=true`
- Sets `subscription_data.metadata.supabase_user_id` so the webhook can resolve the user without a customer ID lookup

**Response:** `{ url: string }` — the Stripe-hosted checkout URL.

**Errors:** `401` if unauthenticated, `400` if `priceId` missing.

---

### `POST /api/stripe/webhook`

Stripe webhook receiver. **Not** session-based — auth is via Stripe signature verification (`STRIPE_WEBHOOK_SECRET`). The raw request body must reach this handler unparsed (`export const dynamic = 'force-dynamic'`).

**Handled events:**

| Event | Action |
|---|---|
| `customer.subscription.created` | Set `tier = 'paid'` if status is `active` or `trialing`, else `'free'`. Store `stripe_customer_id` and `stripe_subscription_id`. |
| `customer.subscription.updated` | Same as above. |
| `customer.subscription.deleted` | Set `tier = 'free'`, clear `stripe_subscription_id`, reset custom text `episode_filter` values on subscriptions back to `'*'`. |

All other event types are acknowledged and ignored (`{ received: true }`).

**User lookup (in order):**
1. `subscription.metadata.supabase_user_id` — present on sessions created by this app
2. `user_profiles.stripe_customer_id` — fallback for subscriptions created outside the app

**Errors:** `400` if `stripe-signature` header is missing or verification fails, `500` if `STRIPE_WEBHOOK_SECRET` is not set.

---

## Local development

To receive webhooks locally, forward them with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The CLI prints a webhook signing secret — set it as `STRIPE_WEBHOOK_SECRET` in `.env.local` while listening. Use test card `4242 4242 4242 4242` (any future expiry, any CVC) to complete a checkout.

The dev upgrade/downgrade endpoints bypass Stripe entirely for fast tier switching:
- `POST /api/dev/upgrade` — sets tier to `paid` instantly
- `POST /api/dev/downgrade` — sets tier to `free`, clears subscription ID, resets episode filters
