# Productionization

Steps to make the app fully production-ready and professionally polished.

---

## Step 1 — Google OAuth Consent Screen Branding

**Problem:** Google shows `dqqybduklxwxtcahqswh.supabase.co` on the OAuth account picker instead of the app name. This erodes trust and looks unpolished.

**Fix (free — no Supabase Pro required):** Trigger Google's brand verification by uploading a logo to the OAuth consent screen. Once verified, Google shows the app name instead of the Supabase domain.

**Steps:**
1. Google Cloud Console → APIs & Services → OAuth consent screen
2. Fill in app name ("SyncPods"), privacy policy URL, and ToS URL
3. Upload a logo — this triggers Google's verification email
4. Google will email asking to verify authorized domains:
   - For `supabase.co` (not owned): reply explaining it's a 3rd-party auth service
   - For your own domain: complete normal Google domain verification
5. After verification (a few business days), the consent screen shows "SyncPods" instead of the raw Supabase URL

**References:**
- [GitHub Discussion #2532](https://github.com/orgs/supabase/discussions/2532)
- [Supabase Issue #33387](https://github.com/supabase/supabase/issues/33387)
