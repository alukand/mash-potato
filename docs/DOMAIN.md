# mashpotato.app — domain + hosted auth checklist

## Deploy topology (2026-07-27)

Two static sites, one repo, no server:

| Host | Source | Build | Output |
| --- | --- | --- | --- |
| `mashpotato.app` | `web/` | none | `web/` |
| `app.mashpotato.app` | repo root | `npm run build` | `dist/` |

The landing page is hand-written and dependency-free on purpose: somebody
reading the pitch should not download the app bundle to do it.

**Cloudflare Pages (or Netlify — both read `_redirects` / `_headers`).**
Two projects, same repo, different root + build command. The app project needs
build env `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is
public by design; see CLAUDE.md).

**DNS:** apex → the landing project, `app` CNAME → the app project, `www` →
redirect to the apex.

### Before the first deploy

1. **Produce `web/og.png`.** Open `web/og.html`, set the viewport to exactly
   1200×630, screenshot the card, save it as `web/og.png`. Until it exists the
   `og:image` on both sites 404s, and some scrapers cache that failure — so do
   this first, not after sharing a link.
2. **Supabase → Auth → URL Configuration**: Site URL `https://mashpotato.app`,
   and add `https://app.mashpotato.app` plus the Pages preview domains to the
   redirect allowlist. Nothing depends on this today (every email flow is a
   6-digit code, not a link), but it must be right before any link-based flow
   ships.
3. Hard-refresh a deep link such as `/film/27205` on the deployed app to prove
   the SPA fallback in `public/_redirects` is live. Without it every shared
   link 404s on reload.

### Known gaps

- No `apple-touch-icon`: iOS ignores SVG and needs a PNG. Android and desktop
  take the SVG from `public/manifest.webmanifest`.
- No `/privacy` page yet, so the landing footer deliberately does not link to
  one. It is an App Store blocker — see `docs/SECURITY.md`.


## Hosted deploy state (last synced 2026-07-25)

Project `lvmcwvhlfijvegxbqipc`. The repo is **linked** (`supabase link` done
locally), so `npx supabase db push` works from here.

- Migrations applied through **20260725120000**. Local and hosted histories
  match — verify with `npx supabase migration list`.
- **Migration history was repaired on 2026-07-25.** Hosted carried
  `20260711201441` (no local file) while local's
  `20260711210000_user_rubrics` showed unapplied: the same migration under
  two version numbers, because it had been applied through the Supabase MCP
  with an auto timestamp. Confirmed by probing the live schema
  (`user_rubrics` already existed), then reconciled with
  `migration repair --status applied 20260711210000` +
  `--status reverted 20260711201441`. **If `db push` ever reports "Remote
  migration versions not found in local migrations directory" again, probe
  the live schema before running the CLI's suggested `repair --status
  reverted` — that command discards a migration's bookkeeping, and if its
  schema is genuinely missing you get silent drift.**
- Anon-key probe of every SECURITY DEFINER RPC returns 401 as of the
  20260725120000 grants repair (see the GRANTS LAW in CLAUDE.md).
- **A client build is useless until its migrations are pushed.** The
  2026-07-25 TestFlight build white-screened with "column groups_1.taste_mode
  does not exist" because the code shipped ahead of the schema. Push
  migrations first, then build.
- Codemagic already holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
  (set up separately); `.env.production` stays gitignored.


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
