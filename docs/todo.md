# TODO

Developer to-do items that require manual setup outside of code changes.

---

## Auth & Email

### [x] Set up custom email sender (transactional emails)

Currently all auth emails (password reset, email confirmation) are sent from `noreply@mail.app.supabase.io` via Supabase's default SMTP. To send from `noreply@syncpods.app`:

1. **Create a Resend account** at [resend.com](https://resend.com) — free tier is 3,000 emails/month, 100/day, no credit card needed.
2. **Add your domain** in the Resend dashboard and verify it by adding the DNS records Resend provides (SPF, DKIM, DMARC) to Porkbun's DNS settings.
3. **Generate a Resend API key.**
4. **Configure custom SMTP in Supabase**: Dashboard → Project Settings → Auth → SMTP Settings:
   - Host: `smtp.resend.com`
   - Port: `465`
   - User: `resend`
   - Password: your Resend API key
   - Sender name: `SyncPods`
   - Sender email: `noreply@syncpods.app`

### [x] Customize email templates

Templates live in `supabase/templates/` — paste HTML into Supabase Dashboard → Authentication → Email Templates for production. Use `{{ .ConfirmationURL }}` as the link placeholder.

> Note: custom SMTP (above) must be set up first before sender address changes take effect.

