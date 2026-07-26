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

The domain is registered at **GoDaddy** — its nameservers are
`ns53.domaincontrol.com` / `ns54.domaincontrol.com`, and `domaincontrol.com`
is GoDaddy's. That is where the nameserver change happens.

Do not be misled by the DNS records: some of them point at **Squarespace**
services (a `pay` CNAME to `paylinks.commerce.squarespace.com`, and a
Squarespace-flavoured apex `A` pair). Those are just a site and a payment
widget that were pointed at the domain. **Read the nameservers to find the
registrar, not the records.**

1. Sign up at <https://dash.cloudflare.com> — the free plan is all this needs.
2. **Add a site** → type `mashpotato.app` → choose **Free**.
3. Cloudflare scans the current DNS and shows you what it found. **Clean it up
   here**, before continuing — see the table below.
4. **Continue to activation.** Cloudflare shows **two nameservers**, e.g.
   `xxx.ns.cloudflare.com`. Copy them.
5. **Turn DNSSEC off at GoDaddy first**, if it is on. Domain settings →
   **DNSSEC** (sometimes under "Additional Settings"). Changing nameservers
   while DNSSEC is enabled with the old provider's keys makes the domain fail
   to resolve *entirely* — not a broken page, a domain that does not exist —
   and it is a miserable thing to debug. Cloudflare can re-enable it later.
6. In GoDaddy: **My Products → Domains → mashpotato.app → DNS**, scroll to
   **Nameservers → Change → I'll use my own nameservers**. Replace
   `ns53.domaincontrol.com` and `ns54.domaincontrol.com` with the two
   Cloudflare gave you, and save. GoDaddy will warn that its own DNS
   management stops applying — that is exactly the point.
7. Back in Cloudflare, click **I updated my nameservers**.

> **Do not use GoDaddy's "Connect My Site" / "Connect Your Domain" panel.**
> That is domain *forwarding* — it points the domain at someone else's site
> and would fight the nameserver change. You want the DNS/Nameservers section,
> not the marketing module.

**Done when:** Cloudflare shows the domain as **Active**. Usually minutes,
sometimes a few hours. You can carry on with steps 2 and 3 while you wait.

### Which scanned records to keep

Cloudflare imports whatever the domain has today. Most of it is Squarespace
parking that would fight the Pages setup later:

| Record | Action | Why |
| --- | --- | --- |
| `A` → `13.248.243.5` | **Delete** | Squarespace parking. The landing project takes over the apex. |
| `A` → `76.223.105.230` | **Delete** | The other half of the same pair. |
| `CNAME www` → `mashpotato.app` | **Delete** | Pages writes its own when you attach `www`. |
| `CNAME pay` → `paylinks.commerce.squarespace.com` | **Delete** if unused | Squarespace payment links. |
| `CNAME _domainconnect` | Keep | Registrar one-click DNS helper. Harmless, and vestigial once DNS is here. |
| `TXT _dmarc` | **Keep** | Email policy. Matters the moment step 5 gives you a mailbox. |

**Delete the leftovers now.** A stale `A` or `CNAME` sitting at a name is
exactly what makes a Pages custom domain refuse to attach later, and the error
does not say so clearly.

An empty-looking zone at this point is correct — nothing should serve
`mashpotato.app` until the Pages projects claim it in steps 3 and 4.

> **On the orange cloud.** Records Cloudflare proxies get its CDN and
> certificate, which is what you want for both Pages projects. But a proxied
> `CNAME` pointing at a *third-party* host (the `pay` record's original state)
> commonly breaks that host's certificate, because it no longer sees the
> request directly. Any third-party subdomain you add later should be **DNS
> only** — click the orange cloud until it turns grey.

> **No MX records were found**, which means no mail is delivered for
> `@mashpotato.app` today. Nothing breaks by moving nameservers — and it is
> why step 5 exists.

> **Why move nameservers at all?** A bare domain (`mashpotato.app`, no `www`)
> cannot legally point at another hostname with a plain CNAME. Cloudflare
> fakes it with CNAME flattening, which is what lets the apex serve the
> landing page. If you would rather keep DNS elsewhere, your registrar must
> support `ALIAS` or `ANAME` records.

## 2. Supabase auth: email templates and URLs

**Do this before you try to sign in anywhere.** `supabase/config.toml` wires
these templates up automatically for the *local* stack, so everything works on
your machine and then fails the first time you use the deployed app. Hosted has
no equivalent — the dashboard is the only place these live.

### The email templates (the part that actually breaks)

Every email flow in this app is a **6-digit code you type into the app**, not a
link you click. Supabase's stock templates send `{{ .ConfirmationURL }}` — a
link — so out of the box you get an email with no code in it, an app asking for
a code that will never arrive, and a link that lands on `localhost:3000`.

> **This needs custom SMTP first — it is not optional.** A free-tier project
> using Supabase's built-in email sender **cannot change its templates at
> all**, by dashboard or by API. The API says so outright: *"Email template
> modification is not available for free tier projects using the default email
> provider."*
>
> That matters more than it sounds, because this app's flows are code-based.
> Without editable templates the stock ones send a LINK, so signup, password
> reset and "email me a sign-in code" **cannot work on hosted, for anyone**.
>
> The built-in sender is unusable for launch regardless: it is heavily
> rate-limited and intended for development. Set up **Resend** (10 minutes,
> free tier, already written up in `docs/DOMAIN.md` §2), point Supabase's SMTP
> settings at it, and then the four templates below can be applied.

Supabase dashboard → project `lvmcwvhlfijvegxbqipc` → **Authentication** →
**Emails** (older UI: **Templates**). Paste subject *and* body for **all four**
from `supabase/templates/`:

| Template | Subject | File |
| --- | --- | --- |
| Confirm signup | `Your Mash Potato code` | `confirmation.html` |
| Reset password | `Reset your Mash Potato password` | `recovery.html` |
| Magic Link | `Your Mash Potato sign-in code` | `magic_link.html` |
| Change email address | `Confirm your new Mash Potato email` | `email_change.html` |

**Magic Link is easy to skip and you will regret it** — it is the template
behind "Email me a sign-in code", so leaving it stock produces exactly the same
symptom as above in a different flow, days later.

The one thing that matters in each body is `{{ .Token }}`, which renders the
6-digit code. If a template still contains `{{ .ConfirmationURL }}`, it has not
been replaced.

### URL configuration

**Authentication → URL Configuration**:

- **Site URL:** `https://mashpotato.app`
- **Redirect URLs:** add `https://app.mashpotato.app` and
  `https://mash-potato.pages.dev` (the preview domain).

Left at its default this is `localhost:3000`, which is where those stock
password-reset links were sending you.

### While you are in here

Two things from `docs/SECURITY.md`:

- **Minimum password length 8** — already applied via the Management API.
- **Leaked password protection (HaveIBeenPwned)** is **Pro-plan only**. The
  API refuses it on free with a 402. It stays on the security advisor list
  until the project is upgraded; it is not a toggle you are missing.

**Done when:** you trigger a password reset from the app and the email contains
a six-digit code rather than a link.

## 3. The app → `app.mashpotato.app`

> **Make sure you are in the PAGES flow, not Workers.** Cloudflare now steers
> new projects toward Workers, and its screens look nearly identical. Two
> tells that you are in the wrong one: the heading says "Configure your
> **Worker** project", and there is a **Deploy command** field containing
> `npx wrangler deploy`. That would fail here — the repo has no
> `wrangler.toml` and no Worker entry point. The Pages form has **no** deploy
> command and **does** have a **Build output directory**.
>
> Pages is the right tool for this repo: two purely static sites, no
> server-side code, already built around `_headers` and `_redirects`. Workers
> static assets would work too, but needs a wrangler config committed per
> site, and two configs in one repo is friction for no gain. Migrating a
> static site to Workers later is documented and low-risk if you ever want to.

1. In Cloudflare: **Workers & Pages** → **Create application** → the **Pages**
   tab → **Connect to Git**. (If you land on a form asking for a deploy
   command, back out — you are in Workers.)
2. Authorise GitHub and pick **`alukand/mash-potato`**.
3. Set up the build:

   | Field | Value |
   | --- | --- |
   | Project name | `mash-potato` |
   | Production branch | `master` |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave blank)* |

   The project name sets the preview subdomain, so this gives you
   `mash-potato.pages.dev`. It has nothing to do with the custom domain you
   attach later.

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

## 4. The landing page → `mashpotato.app`

A **second** Pages project, from the **same repository**.

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
   `alukand/mash-potato` again.

   | Field | Value |
   | --- | --- |
   | Project name | `mash-potato-web` |
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

## 5. Make support@mashpotato.app real

Both `support.html` and the privacy policy publish this address, and Apple
checks the support URL during review. A published address that bounces is
worse than a different address that works.

The domain has **no MX records** today, so there is nothing to preserve and
nothing to break — you are creating this address from scratch.

Use **Cloudflare Email Routing**, since DNS is already here: **Email → Email
Routing → Get started**. Add `support@mashpotato.app` as a custom address,
forward it to an inbox you actually read, and confirm the verification mail
Cloudflare sends to that inbox. **Cloudflare writes the MX and SPF records
itself**, which is the whole reason to prefer it over registrar forwarding —
one less set of records to hand-copy and get subtly wrong.

Squarespace's own email forwarding is the fallback if you would rather not use
Cloudflare for mail, but then the MX records are yours to add.

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
| Password-reset email has a **link**, not a code — and the link lands on `localhost:3000` | The hosted email templates are still Supabase's stock ones. Step 2. `config.toml` only wires these for the *local* stack; hosted needs them pasted in by hand. |
| Custom domain will not attach, or says a record already exists | A leftover `A` or `CNAME` still sits at that name — most likely one of the Squarespace records from step 1. Delete it in the DNS tab and retry; Pages writes its own. |
| Landing page shows the app, or vice versa | The two Pages projects have their output directories swapped: app is `dist`, landing is `web`. |
| Link preview shows nothing | `web/og.png` missing, or a scraper cached an earlier failure. Re-scrape from the debugger in the "Verify the deploy" list. |

## Still outstanding after this

Tracked in `docs/SECURITY.md`:

- **Moderation tooling** — the real App Store blocker. Reports currently pile
  up in tables and banning means hand-written SQL, which cannot honour the
  24-hour commitment Apple asks you to make.
- **APNs secrets** are unset, so push notifications do not deliver. See
  `docs/PUSH.md`.
- **Universal links** (`/.well-known/apple-app-site-association` on the
  landing site) so a tapped web link opens the native app. Worth doing once
  the App Store listing exists.
