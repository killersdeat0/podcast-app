# Claude Code Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up 5 Claude Code automations: 2 MCP servers, 2 hooks, 2 skills, and 1 subagent.

**Architecture:** MCP servers are installed via CLI and persist globally. Hooks are added to `.claude/settings.local.json` (project-local, not committed). Skills and subagents are markdown files created under `.claude/`.

**Tech Stack:** Claude Code CLI, Supabase, Next.js/TypeScript, Stripe

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `.claude/settings.local.json` | Add hooks (type-check, .env guard) |
| Create | `.claude/skills/deploy-edge-function/SKILL.md` | Deploy to both Supabase projects |
| Create | `.claude/skills/db-migration/SKILL.md` | Scaffold + apply DB migrations |
| Create | `.claude/agents/security-reviewer.md` | Security audit subagent |

---

### Task 1: Install MCP Servers

**Files:** None (modifies `~/.claude/` config globally)

- [ ] **Step 1: Install context7 MCP**

Run:
```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```
Expected output: `Added MCP server context7`

- [ ] **Step 2: Install Supabase MCP**

Run:
```bash
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase@latest --access-token YOUR_SUPABASE_ACCESS_TOKEN
```
Replace `YOUR_SUPABASE_ACCESS_TOKEN` with your token from https://supabase.com/dashboard/account/tokens

Expected output: `Added MCP server supabase`

- [ ] **Step 3: Verify both servers appear**

Run:
```bash
claude mcp list
```
Expected: both `context7` and `supabase` listed

---

### Task 2: Add Hooks to settings.local.json

**Files:**
- Modify: `.claude/settings.local.json`

The existing file has only a `permissions` key. Add a `hooks` key alongside it.

- [ ] **Step 1: Add hooks block to `.claude/settings.local.json`**

Replace the closing `}` of the root object so the file becomes:

```json
{
  "permissions": {
    "allow": [
      "mcp__ide__getDiagnostics",
      "Bash(ipconfig getifaddr:*)",
      "WebSearch",
      "Bash(npm install:*)",
      "Bash(npm test:*)",
      "Bash(npm run:*)",
      "Bash(node:*)",
      "Bash(find:*)",
      "Bash(npx playwright:*)",
      "WebFetch(domain:supabase.com)",
      "WebFetch(domain:github.com)",
      "WebFetch(domain:vantezzen.github.io)",
      "WebFetch(domain:www.listennotes.help)",
      "Bash(git pull:*)",
      "Bash(git stash:*)",
      "Bash(git add:*)",
      "Bash(git push:*)",
      "Bash(npx tsc:*)",
      "WebFetch(domain:rss.marketingtools.apple.com)",
      "WebFetch(domain:itunes.apple.com)",
      "Bash(curl -s \"https://itunes.apple.com/search?media=podcast&genreId=1303&limit=5\" | python3 -m json.tool | head -5)",
      "Bash(curl -s \"https://itunes.apple.com/search?media=podcast&term=podcast&genreId=1303&limit=5\" | python3 -m json.tool | head -10)",
      "Bash(curl -s \"https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/5/podcast-comedy.json\" | python3 -m json.tool | head -20)",
      "Bash(curl -s \"https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/5/podcasts.json?genre=1303\" | python3 -m json.tool | head -20)",
      "Bash(git -C /Users/dzma/coding/podcast-app status && git -C /Users/dzma/coding/podcast-app diff --stat && git -C /Users/dzma/coding/podcast-app log --oneline -3)",
      "Bash(supabase functions:*)",
      "Bash(curl:*)",
      "Bash(cat:*)",
      "Bash(grep:*)",
      "Bash(sed:*)",
      "Bash(npm audit:*)",
      "WebFetch(domain:raw.githubusercontent.com)",
      "WebFetch(domain:ui.shadcn.com)",
      "Bash(git:*)",
      "Bash(ls:*)",
      "Bash(cat \"/Users/dzma/coding/podcast-app/web/src/app/\\(app\\)/podcast/[id]/page.tsx\")",
      "WebFetch(domain:www.listennotes.com)",
      "Bash(grep -n \"similar\\\\|feedRefreshKey\\\\|handleRefreshFeed\\\\|RefreshCw\\\\|allSubscriptions\" web/src/app/\\\\\\(app\\\\\\)/podcast/[id]/page.tsx)",
      "Bash(python3 -m json.tool)",
      "Bash(supabase link:*)",
      "Bash(source web/.env.local)",
      "Bash(wc:*)",
      "Bash(vercel link:*)",
      "Bash(vercel env:*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "cd /Users/dzma/coding/podcast-app/web && npx tsc --noEmit 2>&1 | head -20"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"$CLAUDE_TOOL_INPUT\" | python3 -c \"import sys,json; d=json.load(sys.stdin); path=d.get('file_path',''); exit(1 if '.env' in path else 0)\" && true || (echo 'Blocked: .env files must be edited manually' && exit 2)"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

Run:
```bash
python3 -m json.tool /Users/dzma/coding/podcast-app/.claude/settings.local.json > /dev/null && echo "Valid JSON"
```
Expected: `Valid JSON`

---

### Task 3: Create deploy-edge-function Skill

**Files:**
- Create: `.claude/skills/deploy-edge-function/SKILL.md`

- [ ] **Step 1: Create skill directory and file**

Create `.claude/skills/deploy-edge-function/SKILL.md`:

```markdown
---
name: deploy-edge-function
description: Deploy a Supabase Edge Function to both dev and prod projects
disable-model-invocation: true
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
```

- [ ] **Step 2: Verify skill is detected**

Run:
```bash
ls .claude/skills/deploy-edge-function/SKILL.md
```
Expected: file path printed (no error)

---

### Task 4: Create db-migration Skill

**Files:**
- Create: `.claude/skills/db-migration/SKILL.md`

- [ ] **Step 1: Create skill file**

Create `.claude/skills/db-migration/SKILL.md`:

```markdown
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
```

- [ ] **Step 2: Verify skill file exists**

Run:
```bash
ls .claude/skills/db-migration/SKILL.md
```
Expected: file path printed (no error)

---

### Task 5: Create security-reviewer Subagent

**Files:**
- Create: `.claude/agents/security-reviewer.md`

- [ ] **Step 1: Create agents directory and file**

Create `.claude/agents/security-reviewer.md`:

```markdown
---
name: security-reviewer
description: Security audit agent for auth, payments, and data handling code. Use when reviewing changes to proxy.ts, API routes, Stripe webhooks, Supabase queries, or any code handling user data.
---

# Security Reviewer

You are a security-focused code reviewer for a Next.js + Supabase + Stripe podcast app. Your job is to audit code for vulnerabilities specific to this stack.

## Focus Areas

### Auth & Middleware
- Check `web/src/proxy.ts` for routes that should be protected but are listed in `PUBLIC_PATHS`
- Verify API routes use `createClient()` from `@/lib/supabase/server` (not the browser client)
- Flag any route that uses `createAdminClient()` outside of `GET /api/playlists/[id]`

### Stripe Webhooks
- Verify webhook signature is validated with `stripe.webhooks.constructEvent()` before processing
- Check that Stripe secret key is only accessed server-side (never `NEXT_PUBLIC_*`)

### Supabase Queries
- Flag any query that does NOT include `.eq('user_id', user.id)` on user-owned data (subscriptions, queue, progress, playlists)
- Check ownership verification on mutating playlist routes uses `.eq('user_id', user.id)` folded into the query (not a separate check)
- Flag use of `createAdminClient()` (service role key) anywhere other than the public playlist read route

### User Input & XSS
- Verify all RSS/podcast description HTML is sanitized with `DOMPurify.sanitize()` before `dangerouslySetInnerHTML`
- Flag any raw RSS content rendered without sanitization

### Environment Variables
- Flag any secret key (Stripe, Supabase service role) referenced in `NEXT_PUBLIC_*` variables
- Flag any hardcoded credentials or API keys

## Output Format

For each issue found:
- **Severity**: Critical / High / Medium / Low
- **File**: exact path and line number
- **Issue**: what the vulnerability is
- **Fix**: specific code change to resolve it

If no issues found, confirm which areas were checked and give a clean bill of health.
```

- [ ] **Step 2: Verify agent file exists**

Run:
```bash
ls .claude/agents/security-reviewer.md
```
Expected: file path printed (no error)

---

## Summary

| # | What | Where |
|---|------|-------|
| 1 | MCP: context7 | `~/.claude/` (global) |
| 2 | MCP: supabase | `~/.claude/` (global) |
| 3 | Hook: tsc on edit | `.claude/settings.local.json` |
| 4 | Hook: block .env edits | `.claude/settings.local.json` |
| 5 | Skill: deploy-edge-function | `.claude/skills/deploy-edge-function/SKILL.md` |
| 6 | Skill: db-migration | `.claude/skills/db-migration/SKILL.md` |
| 7 | Subagent: security-reviewer | `.claude/agents/security-reviewer.md` |
