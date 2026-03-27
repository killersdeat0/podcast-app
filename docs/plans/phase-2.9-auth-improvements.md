# Auth Flow Improvements ✅ COMPLETE

## Context
The current auth flow is minimal — email/password + Google OAuth, no forgot-password, no email verification UI, and `?returnTo=` is passed by `AuthPromptModal` but silently ignored by `AuthForm`. This plan adds the missing pieces to make auth production-ready.

## Scope
3 features: forgot/reset password, returnTo redirect, email verification screen.

---

## Step 1 — i18n strings (do first — everything else depends on these)

**Files:** `web/src/lib/i18n/locales/en.ts` and `es.ts`

Add to `auth` namespace:
```ts
// Forgot password
forgot_password_link: 'Forgot password?'
forgot_heading: 'Reset your password 🔑'
forgot_description: "Enter your email and we'll send you a reset link."
forgot_email_placeholder: 'Email'
forgot_submit: 'Send reset link'
forgot_success: 'Check your inbox 📬 — a reset link is on its way.'
forgot_back_to_login: '← Back to log in'

// Reset password
reset_heading: 'Set new password 🔒'
reset_description: 'Choose a strong password for your account.'
reset_password_placeholder: 'New password'
reset_confirm_placeholder: 'Confirm new password'
reset_submit: 'Update password'
reset_success: 'Password updated! Redirecting you...'
reset_mismatch: 'Passwords do not match.'
reset_error: 'Something went wrong. Please request a new reset link.'

// Verify email
verify_heading: 'Check your inbox 📬'
verify_description: 'We sent a confirmation link to'
verify_spam_hint: "Don't see it? Check your spam folder."
verify_resend: 'Resend email'
verify_resending: 'Sending...'
verify_resent: 'Email resent! ✓'
verify_resend_error: 'Failed to resend. Please try again.'
verify_back_to_login: '← Back to log in'
```

---

## Step 2 — `auth/callback/route.ts` (full replacement)

Handle 4 scenarios:

| Params | Scenario | Redirect |
|--------|----------|----------|
| `code` | OAuth / PKCE | `exchangeCodeForSession` → `next` or `/discover` |
| `token_hash` + `type=email` | Email confirmation | `verifyOtp` → `/discover` |
| `token_hash` + `type=recovery` | Password reset | `verifyOtp` → `/reset-password` |
| neither | Stale/bad link | `/login` |

Key: add `sanitizeNext()` helper — accepts only relative paths starting with `/` (blocks `//`, protocol-relative, external URLs). On any Supabase error → redirect to `/login`.

---

## Step 3 — `proxy.ts`

Add 3 new paths to `PUBLIC_PATHS`:
```ts
'/forgot-password',
'/reset-password',
'/verify-email',
```

---

## Step 4 — New auth pages (all in `web/src/app/(auth)/`)

### `forgot-password/page.tsx`
- Email input form
- On submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${siteUrl}/auth/callback?next=/reset-password' })`
- On success: show `s.auth.forgot_success` message (no redirect — Supabase handles the email)
- Link: `s.auth.forgot_back_to_login` → `/login`

### `reset-password/page.tsx`
- Requires active session (set by callback's `verifyOtp` for recovery)
- Two password fields: new password + confirm
- Client-side check: passwords match (show `s.auth.reset_mismatch` if not)
- On submit: `supabase.auth.updateUser({ password })`
- On success: show `s.auth.reset_success`, `router.push('/discover')` after 1.5s

### `verify-email/page.tsx`
- Reads `?email=` from search params (wrap in `<Suspense>` per Next.js 16 requirement)
- Shows `s.auth.verify_heading`, email address, spam hint
- Resend button: `supabase.auth.resendSignUp({ email, type: 'signup' })`, show `s.auth.verify_resent` on success
- Link: `s.auth.verify_back_to_login` → `/login`

---

## Step 5 — `AuthForm.tsx` changes

**File:** `web/src/components/ui/AuthForm.tsx`

### a) returnTo
- Add `useSearchParams()` (wrap component in `<Suspense>` — Next.js 16 requires this)
- Read `returnTo = sanitizeNext(searchParams.get('returnTo')) ?? '/discover'`
- After successful login/signup: `router.push(returnTo)`
- In `handleGoogle`: pass `redirectTo: '${siteUrl}/auth/callback?next=${returnTo}'` so it survives OAuth redirect

### b) Email verification state
- After `signUp()` success, check `if (!data.session)` → `router.push('/verify-email?email=' + encodeURIComponent(email))`
- If `data.session` is present, proceed to `returnTo` as normal

### c) Forgot password link
- In login mode only, add below the password field:
```tsx
<div className="flex justify-end">
  <a href="/forgot-password" className="text-xs text-primary hover:text-primary">
    {s.auth.forgot_password_link}
  </a>
</div>
```

---

## Critical files
- `web/src/components/ui/AuthForm.tsx`
- `web/src/app/auth/callback/route.ts`
- `web/src/proxy.ts`
- `web/src/lib/i18n/locales/en.ts`
- `web/src/lib/i18n/locales/es.ts`
- `web/src/app/(auth)/forgot-password/page.tsx` (new)
- `web/src/app/(auth)/reset-password/page.tsx` (new)
- `web/src/app/(auth)/verify-email/page.tsx` (new)

---

## Multi-agent execution plan

Three agents run in **parallel** in isolated worktrees — each touches a non-overlapping set of files:

| Agent | Worktree | Files |
|-------|----------|-------|
| **Foundation** | worktree-auth-foundation | `package.json`, `en.ts`, `es.ts`, `proxy.ts`, `auth/callback/route.ts` |
| **Pages** | worktree-auth-pages | `(auth)/forgot-password/page.tsx`, `(auth)/reset-password/page.tsx`, `(auth)/verify-email/page.tsx` (all new) |
| **AuthForm** | worktree-auth-form | `AuthForm.tsx` only |

After all three complete, merge each worktree branch back to main and run the full verification suite.

---

## Verification
1. `cd web && npm run build` — no TypeScript errors (i18n `satisfies` constraint catches missing locale keys)
2. `cd web && npm test -- --run` — unit tests pass
3. Manual flows:
   - **Forgot password:** request reset → receive email → click link → `/reset-password` → set password → redirected to `/discover`
   - **returnTo:** visit `/discover`, get prompted to sign in, complete auth → land back at `/discover` (or wherever `?returnTo=` pointed)
   - **Email verification:** sign up with new email → see verify-email page → resend works → click confirmation link → `/discover`

## Docs to update
- No new `docs/` file needed — auth patterns are already described in `CLAUDE.md`
