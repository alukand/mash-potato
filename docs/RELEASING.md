# Releasing Mash Potato to TestFlight

The repo is fully build-ready. What remains needs two things only you can
provide: a **hosted Supabase project** (testers' phones can't reach your
local stack) and an **Apple Developer account + a Mac** (Apple requires
Xcode to upload; there is no Windows path for the final step — a cloud CI
Mac like Codemagic works too, see the end).

---

## Part 1 — Hosted Supabase (~10 minutes, any machine)

1. Go to https://supabase.com → sign up (free tier is fine) → **New project**.
   Pick any name (e.g. `mash-potato`), set a database password, create.
2. When it finishes, copy from **Settings → API**:
   - Project URL (`https://xxxx.supabase.co`)
   - `anon` public key
   And note the **project ref** (the `xxxx` part of the URL).
3. In the repo, on this machine:

   ```powershell
   npx supabase login                      # opens a browser to authorize
   npx supabase link --project-ref xxxx    # asks for the DB password
   npx supabase db push                    # applies both migrations
   npx supabase secrets set TMDB_API_KEY=<your TMDB v3 key>
   npx supabase functions deploy tmdb-search
   ```

4. Copy `.env.production.example` → `.env.production` and fill in the URL +
   anon key from step 2.
5. Smoke-test the hosted stack: `npm run build && npm run preview`, sign up,
   create a group, search a title. (This runs the production bundle against
   the hosted project.)

## Part 2 — Apple Developer (~1 day for approval)

1. https://developer.apple.com → enroll in the **Apple Developer Program**
   ($99/year). Approval usually takes a few hours to a day.
2. https://appstoreconnect.apple.com → **Apps → + → New App**:
   - Platform iOS, Name **Mash Potato**
   - Bundle ID: register **com.mashpotato.app** (exactly — it must match
     `capacitor.config.ts`)
   - SKU: anything (e.g. `mash-potato-1`)

## Part 3 — Build & upload (on the Mac)

1. Install **Xcode** from the App Store (big download), open it once and
   accept the license.
2. Get the repo onto the Mac (push to GitHub and clone, or copy the folder).
3. In the repo:

   ```sh
   npm install
   npm run sync:ios          # build with .env.production + copy into ios/
   npx cap open ios          # opens the project in Xcode
   ```

4. In Xcode, select the **App** target:
   - **Signing & Capabilities** → check "Automatically manage signing",
     select your team.
   - **General** → set Version (e.g. 1.0.0) and Build (1).
   - An **App Icon** is required for upload: put a 1024×1024 PNG of the
     potato logo in `Assets.xcassets → AppIcon` (or run
     `npx @capacitor/assets generate --ios` with `resources/icon.png`
     present).
5. Top bar: choose **Any iOS Device (arm64)** → menu **Product → Archive**.
6. When the Organizer opens: **Distribute App → App Store Connect → Upload**
   (defaults are fine).
7. In App Store Connect → your app → **TestFlight** tab: the build appears
   after ~15 min of processing. Fill in the tiny "export compliance"
   questionnaire (uses standard HTTPS encryption only → Yes / exempt).
8. Add yourself under **Internal Testing**, install **TestFlight** on your
   iPhone, accept the invite — the app is on your phone.

## No Mac? Codemagic instead of Part 3

https://codemagic.io has free macOS build minutes: connect the GitHub repo,
pick the Capacitor iOS workflow, upload your App Store Connect API key
(App Store Connect → Users and Access → Integrations), and it archives +
uploads to TestFlight from the cloud. You still need Parts 1–2.

## Android sibling (already set up)

The Play equivalent is **Internal testing** on the Play Console ($25 once):
`npm run sync:android`, open `android/` in Android Studio, **Build → Generate
Signed App Bundle**, upload the `.aab`. The `android/` project in this repo
is ready.
