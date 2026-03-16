# Deployment

## Vercel

This is a monorepo. The Next.js app lives in `web/` — Vercel must be told to use that as the root.

**One-time setup (per Vercel project):**
Go to **Vercel Dashboard → Project → Settings → General → Root Directory** and set it to `web`.

This is a server-side Vercel project setting and cannot be set in `vercel.json`. It persists once configured.

### Preview deployments

Every branch pushed to GitHub gets an automatic preview URL. Open a PR and Vercel will post the preview link as a comment.

### Manual preview via CLI

```bash
npm i -g vercel
cd web && vercel        # deploy preview
cd web && vercel --prod # deploy to production
```

Run from the `web/` directory so the CLI picks up the correct project root.

## Environment variables

`.env.local` must live in `web/` — Next.js only reads env files from its project root directory.

```
web/.env.local   ✓  picked up by Next.js
.env.local       ✗  ignored (monorepo root, outside Next.js project)
```

When setting up a new environment, copy or create `.env.local` directly in `web/`. See `CLAUDE.md` for the required variables.
