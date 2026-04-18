# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Monorepo structure

- `web/` — Next.js 16 web app — see `web/CLAUDE.md` for full details
- `mobile/` — Compose Multiplatform Android/iOS app — see `mobile/CLAUDE.md` for full details
- `supabase/` — shared infra: DB migrations (`supabase/migrations/`) and Edge Functions (`supabase/functions/`)
- `packages/` — shared JS packages (future)

## Supabase shared infra

Schema lives in `supabase/migrations/`. Edge Functions live in `supabase/functions/` and are used by both the web app and the mobile app.

```bash
supabase db push            # apply pending migrations to remote DB

# Edge Functions — deploy to BOTH projects every time:
supabase functions deploy <function-name> --project-ref nuvadoybccdqipyhdhns  # dev
supabase functions deploy <function-name> --project-ref dqqybduklxwxtcahqswh  # prod
```

## Theming

Both web and mobile use **Material3** color roles as the shared design vocabulary. Source color: `#7c3aed` (violet-600). Web uses `--md-*` CSS custom properties; mobile uses `MaterialTheme.colorScheme.*`. Neither platform ever hardcodes hex or rgba values in components.

## Documentation

When asked to commit or making a plan, first check if the change introduces a new pattern, alters existing behavior, or changes an API route (parameters, return shape, or side effects). ALWAYS tell me: update the relevant `CLAUDE.md`, and create or update a focused doc file in `docs/` covering the changed area (e.g. `docs/api.md`, `docs/player.md`). Phase plan files in `docs/plans/` should also be updated if a planned item is completed or changed in scope.
