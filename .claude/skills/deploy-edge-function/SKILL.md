---
name: deploy-edge-function
description: Deploy a Supabase Edge Function to both dev and prod projects
---

# Deploy Edge Function

Deploy the named Edge Function to both Supabase projects.

## Usage

`/deploy-edge-function <function-name>`

## Steps

1. Deploy to **dev** project:

```bash
supabase functions deploy <function-name> --project-ref nuvadoybccdqipyhdhns --no-verify-jwt
```

2. Deploy to **prod** project:

```bash
supabase functions deploy <function-name> --project-ref dqqybduklxwxtcahqswh --no-verify-jwt
```

3. Confirm both deployments succeeded (no error output).

⚠️ Always deploy to BOTH projects. Deploying to only one causes dev/prod drift.

⚠️ Always use `--no-verify-jwt`. All current functions call public external APIs (RSS/iTunes) — JWT verification adds no security and breaks when using Supabase's `sb_publishable_*` key format.
