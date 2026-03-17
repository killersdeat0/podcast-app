# GEMINI.md

This file provides guidance and constraints specifically for the Gemini AI agent when working in this repository. 

## 1. Primary Context Initialization
**CRITICAL:** At the start of any new session or task, you MUST read `CLAUDE.md` (if it exists in the repository root). It contains the shared source of truth for architectural decisions, routing rules, data flows, Supabase client conventions, intentional lint suppressions, and essential environment setups. 

## 2. Guardrails & Security
**CRITICAL: Do not auto-run any command that modifies the remote database or cloud infrastructure.**

You MUST always pause and ask the user for explicit permission before executing commands that include any of the following:

- `supabase db push` 
- `supabase db reset`
- `supabase functions deploy`
- Any deployment scripts (e.g., `npm run deploy`, `vercel deploy`)
- Any database migration execution commands
- Commands that perform `git push` or mutate the remote Git repository
- Installing or updating packages globally or modifying core dependencies

_Actionable Instruction for Gemini: If you propose a command matching the list above, you MUST set `SafeToAutoRun` to `false` in your tool call._

## 3. Operations & Testing Constraints
When implementing features or refactoring, adhere to the following local testing rules:
- **Unit Tests:** Always run `cd web && npm test -- --run` before finalizing a code change.
- **E2E Tests:** Run `cd web && npm run test:e2e` before completing changes that affect multiple components, auth flows, API route shapes, or the global player state. 
- **E2E Dependencies:** Running E2E tests requires the dev server (`npm run dev`) on port 3000 and the E2E test secrets in `web/.env.local`.
- **Blocked Features:** Do not attempt to implement "silence skipping" for the web player; the browser's Web Audio API blocks cross-origin podcast audio files without a custom proxy. This is intentionally disabled.

## 4. Documentation & Phase Plans
When modifying API routes, introducing new UI patterns, or checking off roadmap items:
- Always update the relevant documentation in the `docs/` folder (e.g., `docs/api.md`, `docs/data-model.md`).
- Keep the phase plans in `docs/plans/` synchronized. When you finish a chunk of work, check the box in the markdown file.
- If a new systemic pattern emerges or an environment variable is introduced, format a summary so the user can paste it into `CLAUDE.md` to keep Claude Code in sync with your work.
