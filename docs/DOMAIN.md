# mashpotato.app — domain + hosted auth checklist

The app's email flows are CODE-based (6-digit `{{ .Token }}` entered
in-app), so nothing here blocks shipping — hosted works today on
Supabase's built-in sender. This doc is (1) the dashboard settings that
must mirror local config, and (2) the branded-email setup so auth codes
arrive from `no-reply@mashpotato.app`.

## 1. Hosted dashboard settings (do once, ~10 minutes)

Project `lvmcwvhlfijvegxbqipc` → https://supabase.com/dashboard

**Auth → Templates** — paste the three files from `supabase/templates/`
(they show the 6-digit code; the default templates only carry a link the
mobile app can't use):

| Template | Subject | File |
| --- | --- | --- |
| Confirm sign up | Your Mash Potato code | `confirmation.html` |
| Reset password | Reset your Mash Potato password | `recovery.html` |
| Change email address | Confirm your new Mash Potato email | `email_change.html` |

**Auth → Providers → Email**
- Confirm email: **ON** (already on; the app now handles the code step)
- Secure email change (double confirm): **OFF** — the code goes to the
  new address only, matching the app's single-code flow
- Minimum password length: **8**

**Auth → Attack protection (or Security)**
- Leaked password protection (HaveIBeenPwned): **ON**
  (the one security-advisor WARN that only a dashboard toggle can clear)

## 2. Branded auth email (no-reply@mashpotato.app via Resend)

Resend has a free tier (3k emails/month) and the simplest Supabase SMTP
handshake. Any SMTP provider works; the Supabase settings are the same.

1. Create an account at https://resend.com and add the domain
   `mashpotato.app` (Domains → Add domain).
2. Resend shows DNS records to add at your registrar (values are
   generated per-account; copy them exactly). The shape will be:
   - TXT `send.mashpotato.app` — SPF (`v=spf1 include:amazonses.com ~all`-style)
   - MX `send.mashpotato.app` — feedback routing
   - TXT `resend._domainkey.mashpotato.app` — DKIM public key
   - Recommended extra: TXT `_dmarc.mashpotato.app` →
     `v=DMARC1; p=none;` (tighten to `quarantine` once sending is stable)
3. Wait for Resend to show the domain **Verified**, then create an API
   key (Sending access only).
4. Supabase dashboard → Project Settings → Auth → **SMTP Settings**:
   - Enable custom SMTP
   - Host `smtp.resend.com`, Port `465`
   - Username `resend`
   - Password = the Resend API key
   - Sender email `no-reply@mashpotato.app`, sender name `Mash Potato`
5. Send yourself a password-reset from the app and check the code email
   arrives from the new sender (and not in spam).

Note: with custom SMTP enabled, Supabase's email rate limit becomes
yours to configure (Auth → Rate limits). The built-in sender's limits
stop applying.

## 3. Later (not needed for code-based flows)

- **Universal links**: host
  `https://mashpotato.app/.well-known/apple-app-site-association` and add
  the Associated Domains capability — only needed if we ever switch auth
  emails from codes to tap-a-link, or add share links that open the app.
- **Landing page**: the domain can front a one-pager (pitch + TestFlight
  link + support contact) on Cloudflare Pages/Netlify; also where the
  AASA file above would live.
- **support@mashpotato.app**: registrar-level email forwarding to the
  current support inbox, when you want the branded address in the app.
