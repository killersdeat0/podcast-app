---
name: db-migration
description: Scaffold a new Supabase DB migration file and apply it to the remote database
disable-model-invocation: true
---

# DB Migration

Scaffold a timestamped migration file and push it to the remote database.

## Usage

`/db-migration <migration-name>`

## Steps

1. Generate the migration file name using current timestamp:

```bash
date +%Y%m%d%H%M%S
```

2. Create the migration file at:
`supabase/migrations/<timestamp>_<migration-name>.sql`

3. Write the SQL for the migration into the file.

4. Apply to remote DB:

```bash
supabase db push
```

5. Verify no errors in output.

6. Update `docs/data-model.md` to reflect any schema changes.

⚠️ Always use `{ onConflict: 'feed_url,guid' }` when upserting into the `episodes` table.
