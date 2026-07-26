# Going live on mashpotato.app

A checklist for putting the landing page and the app on the domain. Follow it
top to bottom; each step says what "done" looks like so you never have to guess
whether to move on.

**Before you start you need:** the GitHub account that owns
`alukand/mash-potato`, the login for wherever you bought `mashpotato.app`, and
about 30 minutes of clicking plus some DNS waiting.

**What you end up with:**

| URL | What it serves |
| --- | --- |
| `mashpotato.app` | the landing page (`web/`, static, no build) |
| `www.mashpotato.app` | redirect to the apex |
| `app.mashpotato.app` | the app (`dist/`, built by Vite) |

---

## 1. Cloudflare account and nameservers

1. Sign up at <https://dash.cloudflare.com> — the free plan is all this needs.
2. **Add a site** → type `mashpotato.app` → choose **Free**.
3. Cloudflare will show you **two nameservers**, e.g.
   `xxx.ns.cloudflare.com`. Copy them.
4. Log in to the registrar you bought the domain from, find the domain's
   **nameserver** setting (sometimes "DNS" or "Custom DNS"), and replace what
   is there with Cloudflare's two.
5. Back in Cloudflare, click **Check nameservers**.

**Done when:** Cloudflare shows the domain as **Active**. Usually minutes,
sometimes a few hours. You can carry on with steps 2 and 3 while you wait.

> **Why move nameservers at all?** A bare domain (`mashpotato.app`, no `www`)
> cannot legally point at another hostname with a plain CNAME. Cloudflare
> fakes it with CNAME flattening, which is what lets the apex serve the
> landing page. If you would rather keep DNS elsewhere, your registrar must
> support `ALIAS` or `ANAME` records.

## 2. The app → `app.mashpotato.app`

1. In Cloudflare: **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Authorise GitHub and pick **`alukand/mash-potato`**.
3. Set up the build:

   | Field | Value |
   | --- | --- |
   | Project name | `mashpotato-app` |
   | Production branch | `master` |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave blank)* |

4. Expand **Environment variables (advanced)** and add two, for **Production**:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://lvmcwvhlfijvegxbqipc.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the long key from your local `.env.production` |

   Both are meant to be public — the anon key is designed to ship in the
   client and row-level security is what protects the data. **Never** put the
   `service_role` key or the TMDB key here.

5. **Save and Deploy.** The first build takes a couple of minutes.
6. When it succeeds, open the `*.pages.dev` URL it gives you and check the app
   loads and you can sign in.
7. **Custom domains** → **Set up a custom domain** → `app.mashpotato.app` →
   Activate. With DNS on Cloudflare the record is created for you.

**Done when:** `https://app.mashpotato.app` loads and you can sign in.

## 3. The landing page → `mashpotato.app`

A **second** Pages project, from the **same repository**.

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
   `alukand/mash-potato` again.

   | Field | Value |
   | --- | --- |
   | Project name | `mashpotato-web` |
   | Production branch | `master` |
   | Build command | *(leave completely empty)* |
   | Build output directory | `web` |

   No build, no environment variables — it is four static files. This is
   deliberate: someone reading the pitch should not download the app bundle to
   do it.

2. **Custom domains** → add **both** `mashpotato.app` and
   `www.mashpotato.app`.

**Done when:** `https://mashpotato.app` shows the landing page, and the
Privacy, Support and "Open the app" footer links all work.

## 4. Point Supabase at the new origins

Supabase dashboard → project `lvmcwvhlfijvegxbqipc` → **Authentication** →
**URL Configuration**:

- **Site URL:** `https://mashpotato.app`
- **Redirect URLs:** add `https://app.mashpotato.app` and
  `https://mashpotato-app.pages.dev` (the preview domain).

Nothing depends on this today — every email flow in the app is a 6-digit code
you type in, not a link you click — but it has to be right before any
link-based flow ships.

While you are in the dashboard, two things from `docs/SECURITY.md` worth
doing now:

- **Authentication → Providers → Email → Leaked password protection: ON.**
  One toggle, and it clears the last actionable security advisor.
- Confirm **Minimum password length is 8**, matching the app.

## 5. Make support@mashpotato.app real

Both `support.html` and the privacy policy publish this address, and Apple
checks the support URL during review. A published address that bounces is
worse than a different address that works.

Most registrars offer **free email forwarding**: point `support@mashpotato.app`
at an inbox you already read. If yours does not, Cloudflare has **Email
Routing** (Email → Email Routing) which does the same thing free.

**Done when:** you send a mail to `support@mashpotato.app` from your phone and
it arrives.

## 6. Fill in the privacy policy

`web/privacy.html` is written and accurate about what the app collects, but it
has placeholders. Search the file for `[` and replace:

- `[LEGAL ENTITY]` — your trading or company name
- `[JURISDICTION]` — the country or state whose law governs
- `[EFFECTIVE DATE]` — the date you publish
- `[EMAIL PROVIDER]` — whoever sends your auth mail (Supabase's built-in
  sender today; Resend if you follow `docs/DOMAIN.md`)

It describes real behaviour, not boilerplate — but it is **not legal advice**.
Have someone qualified read it before you submit to the App Store.

---

## Verify the deploy

Run these once both projects are green. They are ordered by how likely they
are to catch something.

1. **Hard-refresh a deep link:** open
   `https://app.mashpotato.app/film/27205` and press Ctrl-Shift-R.
   It must load the film page. If it 404s, `public/_redirects` did not ship
   and every link anyone shares will break on reload.
2. **Check the headers:**

   ```bash
   curl -sI https://app.mashpotato.app | grep -i content-security-policy
   ```

   Returning a policy proves `public/_headers` was applied rather than
   silently ignored.
3. **Open DevTools on the app.** The Console should show no CSP violations,
   and the Network tab should show a live `wss://` connection to Supabase.
   Realtime is the first thing that dies if `connect-src` is wrong.
4. **Check the link preview:** paste `https://mashpotato.app` into
   <https://www.opengraph.xyz> and confirm the card renders with the potato
   artwork.
5. **Add to Home Screen** on a phone and confirm you get the potato icon
   rather than a screenshot.

## When something is wrong

| What you see | What it actually is |
| --- | --- |
| Build fails with a syntax error, or complains about `crypto` / `??=` | Node too old. Cloudflare should read `.nvmrc` (pinned to 22); if not, add a build environment variable `NODE_VERSION` = `22`. |
| App loads but shows a coral **"Mash Potato couldn't start"** card | The `VITE_*` environment variables are missing or wrong. The message names which one. Fix them, then **re-deploy** — env changes do not apply to an existing build. |
| Domain simply will not load at all, right after setup | `.app` is an HSTS-preloaded TLD, so browsers refuse plain HTTP entirely. Until the certificate is issued the site is unreachable rather than "insecure". Wait ten minutes. |
| Deep links 404 on refresh, but the home page works | `public/_redirects` missing from the build output. Confirm the app project's output directory is `dist`. |
| App loads, no data, Console full of CSP errors | `connect-src` in `public/_headers` does not match your Supabase URL. |
| Landing page shows the app, or vice versa | The two Pages projects have their output directories swapped: app is `dist`, landing is `web`. |
| Link preview shows nothing | `web/og.png` missing, or a scraper cached an earlier failure. Re-scrape from the debugger in step 4. |

## Still outstanding after this

Tracked in `docs/SECURITY.md`:

- **Moderation tooling** — the real App Store blocker. Reports currently pile
  up in tables and banning means hand-written SQL, which cannot honour the
  24-hour commitment Apple asks you to make.
- **APNs secrets** are unset, so push notifications do not deliver.
- **Universal links** (`/.well-known/apple-app-site-association` on the
  landing site) so a tapped web link opens the native app. Worth doing once
  the App Store listing exists.
