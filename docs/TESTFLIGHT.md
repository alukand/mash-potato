# Mash Potato → TestFlight: status & steps

The app is build-ready and a cloud-CI pipeline is wired, so no Mac is required.
What's left splits into: **done in the repo**, one **hosted-backend step we do
together**, and the **Apple / Codemagic account steps** only you can do.

## Done (in the repo)
- iOS project carries the current build (all features); Codemagic re-syncs on build.
- `codemagic.yaml` — cloud macOS → build → sign → **TestFlight** (no local Mac).
- `capacitor.config.ts`: bundle id `com.mashpotato.app`, name "Mash Potato".
- Portrait-locked (`Info.plist`); `viewport-fit=cover` for safe areas.
- Branded icon source at `resources/icon.svg` (see `resources/README.md`).
- `.env.production` points at the hosted Supabase project.

## Hosted backend — 1 step you do, then I finish
The TestFlight app talks to the **hosted** project, which needs the current
`tmdb-search` Edge Function (search / browse / detail / genres / person /
discover) plus the TMDB key as a **secret** (never in code):

1. **You:** Supabase dashboard → your project → **Edge Functions → Secrets** →
   add `TMDB_API_KEY` = your TMDB v3 key (kept locally in the gitignored
   `supabase/functions/.env`, never committed).
2. **Me:** redeploy the clean `tmdb-search` function (env-only) via MCP.

> Status (2026-07-07): the secret is set and `tmdb-search` v4 is deployed &
> verified live — this hosted step is already done.

(The `saved_titles` migration is already applied to hosted.)

## Your account steps
1. **Apple Developer Program** ($99/yr) — approval takes a few hours to a day.
2. **App Store Connect → Apps → + → New App**: iOS, name "Mash Potato", bundle
   `com.mashpotato.app`, any SKU. Note the app's numeric **Apple ID**.
3. **App Store Connect → Users and Access → Integrations → App Store Connect
   API** → generate an **App Manager** key (Key ID, Issuer ID, `.p8` download).
4. **Push to GitHub** (Codemagic's source; there's no `gh` on this machine):
   ```
   git remote add origin https://github.com/<you>/mash-potato.git
   git push -u origin master
   ```
5. **Codemagic** (codemagic.io — free macOS minutes):
   - Connect the GitHub repo.
   - Team → Integrations → App Store Connect: upload the `.p8`; name it, and put
     that name in `codemagic.yaml` → `integrations.app_store_connect`
     (replace `CHANGE_ME_ASC_KEY`).
   - Add variable group **`mashpotato_env`** with `VITE_SUPABASE_URL` +
     `VITE_SUPABASE_ANON_KEY` (values in `.env.production`).
   - Set `APP_APPLE_ID` in `codemagic.yaml` to the numeric Apple ID from step 2.
   - Run the **ios-testflight** workflow → builds, signs (automatic via the API
     key), and submits to TestFlight.
6. **TestFlight**: build appears after ~15 min → answer the export-compliance
   question (standard HTTPS → exempt) → add yourself to Internal Testing →
   install the TestFlight app → accept the invite.

## Recommended follow-ups (not blocking)
- **Self-host fonts** — `index.html` loads Google Fonts; bundle them (`@fontsource`)
  so the packaged app renders right offline. Needs a dependency, so I'll ask first.
- **Brand the icon** — rasterize `resources/icon.svg` → `icon.png` and run
  `npx @capacitor/assets generate` (see `resources/README.md`).
