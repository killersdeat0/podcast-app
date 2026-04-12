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
supabase functions deploy <function-name> --project-ref nuvadoybccdqipyhdhns
```

2. Deploy to **prod** project:

```bash
supabase functions deploy <function-name> --project-ref dqqybduklxwxtcahqswh
```

3. Confirm both deployments succeeded (no error output).

⚠️ Always deploy to BOTH projects. Deploying to only one causes dev/prod drift.
