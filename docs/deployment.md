# Deployment

## How everything connects

```
GitHub repo
    │
    ├── Vercel (hosts the Next.js web app)
    │       └── reads env vars to talk to Supabase + Stripe
    │
    ├── Supabase (database, auth, Edge Functions)
    │       ├── DB migrations (supabase/migrations/)
    │       └── Edge Functions (supabase/functions/)
    │
    └── Stripe (payments)
            └── webhooks fire at your Vercel URL
```

The three services are independent — they're linked only through environment variables. There's no plugin or native integration between them.

---

## Current project inventory

### Supabase
| Name | Ref | Used for |
|---|---|---|
| `podcast-dev` | `nuvadoybccdqipyhdhns` | Local dev |
| `podcast-app-prod` | `dqqybduklxwxtcahqswh` | Production |

To switch the CLI between them:
```bash
supabase link --project-ref nuvadoybccdqipyhdhns  # dev
supabase link --project-ref dqqybduklxwxtcahqswh  # prod
```

**When adding a migration**, run `supabase db push` against **both** projects:
```bash
supabase link --project-ref nuvadoybccdqipyhdhns && supabase db push  # dev
supabase link --project-ref dqqybduklxwxtcahqswh && supabase db push  # prod
```

### Vercel
| Project | URL | Supabase project |
|---|---|---|
| `podcast-app-ccf9` | podcast-app-ccf9.vercel.app | `podcast-dev` |
| `web` | syncpods.app | `podcast-app-prod` |

### Domain
Production domain: `syncpods.app` (configured in Vercel `web` project).

---

## Do you need separate projects for dev vs prod?

### Vercel — two projects (current setup)

We use two Vercel projects — one for dev/preview (`podcast-app-ccf9`) and one for production (`web`/syncpods.app). Each has its own env vars pointing at the correct Supabase project and Stripe keys.

### Supabase — two projects (current setup)

`podcast-dev` for local development, `podcast-app-prod` for production. Real user data stays isolated from dev/test data.

### Stripe — one account, two modes

Stripe has test mode and live mode built in. `podcast-app-ccf9` uses test keys (`sk_test_...`), production uses live keys (`sk_live_...`). No second account needed.

---

## Current setup (single Supabase project)

If you're comfortable sharing one Supabase project between local dev and production:

1. Your `web/.env.local` already has the correct values for local dev.
2. In **Vercel Dashboard → Project → Settings → Environment Variables**, add the same values for the **Production** environment:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_MONTHLY_PRICE_ID
STRIPE_YEARLY_PRICE_ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID
```

3. Register your production Stripe webhook (see Stripe section below).
4. Deploy: `cd web && vercel --prod`

---

## Setting up a separate production Supabase project

Do this when you're ready to isolate prod data from dev.

### 1. Create the project

- Go to supabase.com → New project
- Choose a region close to your users
- Save the database password somewhere safe

### 2. Apply migrations

```bash
supabase link --project-ref <your-new-prod-project-ref>
supabase db push
```

This runs all migrations in `supabase/migrations/` against the new project.

### 3. Deploy Edge Functions

```bash
supabase functions deploy podcasts-feed --no-verify-jwt
supabase functions deploy podcasts-search
```

`podcasts-feed` must use `--no-verify-jwt` — Supabase's new `sb_publishable_*` key format is not a valid JWT, so the gateway rejects requests without this flag. The function only fetches public RSS feeds so there is no security downside.

### 4. Get the new project's keys

In the Supabase dashboard → Project Settings → API:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### 5. Update Vercel env vars

In Vercel Dashboard → Project → Settings → Environment Variables, set the three Supabase values above for the **Production** environment only. Leave your **Development** environment pointing at the old dev project.

### 6. Configure Supabase Auth

In the prod Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL** → `https://www.syncpods.app`
- **Additional redirect URLs** → add `https://www.syncpods.app/auth/callback`

In **Authentication → Providers → Google** → enable and paste the same Client ID and Secret from Google Cloud Console. Also add `https://dqqybduklxwxtcahqswh.supabase.co/auth/v1/callback` to the authorized redirect URIs in Google Cloud Console.

---

## Stripe production setup

### 1. Activate your Stripe account

Stripe requires business info and a bank account before live mode works.

### 2. Create products

In the Stripe dashboard (make sure you're in **Live mode**, not Test mode):
- Products → Add product → create monthly and yearly prices
- Copy the price IDs

### 3. Register the webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://your-domain.com/api/stripe/webhook`
- Events to listen for:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copy the signing secret

### 4. Set live Stripe keys in Vercel

For the **Production** environment in Vercel:

```
STRIPE_SECRET_KEY              → sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY → pk_live_...
STRIPE_WEBHOOK_SECRET          → whsec_... (from the webhook you just registered)
STRIPE_MONTHLY_PRICE_ID        → price_... (live mode price)
STRIPE_YEARLY_PRICE_ID         → price_... (live mode price)
NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID  → same as above
NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID   → same as above
```

Keep your `web/.env.local` using test keys (`sk_test_...`) for local dev.

---

## Vercel setup (one-time)

1. Connect your GitHub repo to Vercel
2. **Settings → General → Root Directory** → set to `web`
3. Add all environment variables (see above)
4. Every push to `main` auto-deploys to production. Every other branch gets a preview URL.

### Manual deploy via CLI

```bash
npm i -g vercel
cd web && vercel        # preview deploy
cd web && vercel --prod # production deploy
```
