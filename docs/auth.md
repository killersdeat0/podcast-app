# Auth

## Overview

Authentication uses Supabase Auth with two sign-in methods: email/password and Google OAuth. Unauthenticated users can browse public routes as guests — no account required.

---

## Pages

All auth pages live in `web/src/app/(auth)/` and inherit the centered max-w-md card layout from `(auth)/layout.tsx`.

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `login/page.tsx` | Email/password login + Google OAuth |
| `/signup` | `signup/page.tsx` | Email/password signup + Google OAuth |
| `/forgot-password` | `forgot-password/page.tsx` | Request a password reset email |
| `/reset-password` | `reset-password/page.tsx` | Set a new password (after clicking reset link) |
| `/verify-email` | `verify-email/page.tsx` | "Check your inbox" screen after signup |

All five routes are in `PUBLIC_PATHS` in `proxy.ts` — they must remain accessible to unauthenticated users.

`/ads.txt` is also in `PUBLIC_PATHS` so the Google AdSense crawler can access it for site verification without being redirected to login.

The main form logic lives in `web/src/components/ui/AuthForm.tsx`, shared by both `/login` and `/signup`.

---

## Auth flows

### Email/password signup
```
/signup → AuthForm.signUp()
  ├─ error → show error message
  ├─ data.session === null (email confirmation required)
  │    └─ redirect to /verify-email?email=<encoded>
  └─ data.session present
       └─ redirect to returnTo (or /discover)
```

### Email verification
```
/verify-email?email=<encoded>
  └─ user clicks link in inbox
       └─ /auth/callback?token_hash=<hash>&type=email
            └─ verifyOtp() → redirect to /discover
  └─ resend button → supabase.auth.resend({ email, type: 'signup' })
```

### Email/password login
```
/login → AuthForm.signInWithPassword()
  ├─ error → show error message
  └─ success → redirect to returnTo (or /discover)
```

### Forgot password
```
/forgot-password
  └─ submit email → resetPasswordForEmail({ redirectTo: '/auth/callback?next=/reset-password' })
       └─ user clicks link in inbox
            └─ /auth/callback?token_hash=<hash>&type=recovery
                 └─ verifyOtp() → redirect to /reset-password
                      └─ updateUser({ password }) → redirect to /discover after 1.5s
```

### Google OAuth
```
AuthForm.handleGoogle()
  └─ signInWithOAuth({ redirectTo: '/auth/callback?next=<returnTo>' })
       └─ /auth/callback?code=<code>&next=<returnTo>
            └─ exchangeCodeForSession() → redirect to returnTo (or /discover)
```

---

## `auth/callback` route

`web/src/app/auth/callback/route.ts` is the single handler for all Supabase redirects. It handles four scenarios:

| Params present | Scenario | Action |
|----------------|----------|--------|
| `code` | OAuth sign-in or PKCE | `exchangeCodeForSession(code)` → redirect to `next` or `/discover` |
| `token_hash` + `type=email` | Email confirmation link | `verifyOtp({ token_hash, type })` → redirect to `next` or `/discover` |
| `token_hash` + `type=recovery` | Password reset link | `verifyOtp({ token_hash, type })` → redirect to `/reset-password` |
| neither | Stale or malformed link | redirect to `/login` |

On any Supabase error in the above, the route redirects to `/login` — it never exposes which step failed.

---

## `returnTo` redirect chain

`AuthPromptModal` (shown when a guest tries a protected action) passes `?returnTo=<path>` to `/login` and `/signup`. `AuthForm` reads it and redirects there after a successful login/signup instead of always going to `/discover`. The same `next` param is threaded through Google OAuth via the `redirectTo` URL so it survives the external redirect.

**Security:** the `next` / `returnTo` value is always passed through `sanitizeNext()` before use, which blocks:
- External URLs (`https://evil.com`)
- Protocol-relative URLs (`//evil.com`)
- Scheme injections (`/javascript:alert(1)`, `/data:...`)

Only paths starting with `/` and containing no scheme are accepted. Tests live in `web/src/app/auth/callback/sanitizeNext.test.ts`.

---

## Guest mode

Public routes (`/discover`, `/podcast/[id]`, `/queue`, `/playlist/[id]`) are accessible without an account. `UserContext` tracks `isGuest: true` for unauthenticated visitors. Guest queue state is stored in `localStorage` under `guestQueue` and cleared on sign-in.

`AuthPromptModal` is used throughout the app to gate actions that require an account (subscribing, saving progress, creating playlists). It accepts a `dismissable={false}` prop for hard gates where continuing as guest is not allowed.

---

## Supabase clients

- `web/src/lib/supabase/client.ts` — browser client (used in all auth page components)
- `web/src/lib/supabase/server.ts` — server client with cookies (used in `auth/callback/route.ts`)

Never use the admin client (`admin.ts`) for auth flows — it bypasses RLS and is only for serving public playlist reads.
