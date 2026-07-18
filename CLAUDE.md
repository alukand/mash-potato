# Mash Potato — project instructions

Mobile movie/TV review app: a GROUP composes a weighted rubric (base seven —
Story, Acting, Writing, Cinematography, Pacing, Score & Soundtrack, Emotional
Impact — plus optional and genre-matched add-ons; Humor and Fear Factor land
HEAVY at 35 on comedy/horror nights), members
rate each category blind, the app mashes weighted scores into one group
"Mashed" score, then THE REVEAL drops everyone's scores at once and headlines
agreement vs. clash. Each session snapshots its rubric at creation
(`reveal_sessions.rubric`), so history survives rubric edits.

## Locked — do not redesign or rename

- The moat: weights live on the GROUP; one Mashed score per title (always
  teal, labelled "Mashed"); the blind Reveal; disagreement-as-headline
  (most contested + most united category, per-category outlier).
- Stack: React + TS + Vite, Tailwind v4 (CSS-first `@theme` in
  `src/index.css` — no tailwind.config.js), Capacitor (android/ + ios/
  generated), Supabase (Auth + Postgres + Realtime + RLS), push via
  APNs-direct (FCM when Android ships), TMDB. Mobile-first single ~480px column. Ask before adding dependencies
  (including a router — deliberately absent so far).
- Design tokens + fonts (Bricolage Grotesque / Hanken Grotesk / Azeret Mono)
  live in `src/index.css` and `index.html`. Score ramp 1→10 coral→gold→lime is
  `src/lib/scoreColor.ts`.

## THE ONE RULE THAT MUST NOT BE WRONG

Blind scores are enforced SERVER-SIDE by RLS on `public.member_scores`: a
member reads others' scores ONLY when the session is `revealed` AND their own
scorecard is locked (`has_locked_scorecard` — reveals open PER MEMBER, so
late scorers stay genuinely blind too). UI hiding is never the boundary. Write paths: direct INSERT is blind-only; post-reveal
writes exist ONLY via two constrained SECURITY DEFINER RPCs
(`late_score_session` for members with no locked card, and
`backfill_category_score` which can add a missing category but NEVER change a
locked score — it also grows the session's rubric snapshot append-only).
Any schema change touching this needs both test suites updated and passing:

- `npx supabase test db` — pgTAP, `supabase/tests/blind_read_test.sql`
- `powershell -File scripts\verify-rls.ps1` — portable-Postgres twin
  (see `scripts/verify-rls/README.md`)

Never put the TMDB key or service_role key in client code — TMDB goes through
the `tmdb-search` Edge Function (`supabase/functions/`; local secret in
`supabase/functions/.env`, hosted via `supabase secrets set`). The anon key is
fine client-side.

GRANTS LAW (hardening migration 20260717160000): `public` functions get NO
default execute — every new function migration must grant explicitly
(client RPCs and RLS helpers → `grant execute ... to authenticated`;
trigger internals → no grant at all). Anon executes nothing. The twin's
`20-grants.sql` mirrors the exceptions; `account_test.sql` + the twin's
98 file assert the posture, so a forgotten grant fails the suites.

## Commands

- `npm run dev` — Vite on port 5180 (fixed; 5173/5174 belong to another project)
- `npm test` / `npm run lint` / `npm run build` (tsc -b + vite)
- `npm run sync` / `sync:ios` / `sync:android` — build + copy into native shells
- `npx supabase start|stop|db reset|test db` — local stack (Docker)
- Regenerate DB types (PowerShell — cmd wrapper avoids UTF-16 mangling):
  `cmd /c "npx supabase gen types typescript --local > src\lib\database.types.ts"`

## Architecture map

- `src/lib/scoring.ts` — ALL scoring math, pure, unit-tested. Categories are
  DYNAMIC (string keys); category-iterating functions take the session's
  ordered category list.
- `src/lib/rubricCatalog.ts` — the category catalog (base/optional/genre),
  DEFAULT_WEIGHTS, `mashRubrics` (per-member rubrics → effective group rubric;
  absent/disabled counts as 0), and `resolveSessionRubric[Tagged]` (effective
  rubric ∪ TMDB-genre add-ons; pass `configuredCategoryKeys(raw rubrics)` so
  a category the whole group disabled stays out). Animated titles (genre 16)
  relabel `cinematography` → Animation (same weight) and `acting` → Voice
  Acting at 0.85× (keys unchanged for history coherence). PRODUCT LAW
  (researched 2026-07-12, see
  DESIGN.md "Rubric cadence"): weights never change per movie — per-round
  flexibility is only the binary genre add-on opt-out in `RubricReceipt` at
  session creation.
- `src/lib/mapping.ts` — jsonb `scores` / `rubric` snapshot validators.
- `src/lib/api.ts` — every Supabase call; screens never import the client.
  Member ratings live in `member_scores.scores` (jsonb map) plus an optional
  one-sentence take (`member_scores.one_liner`, ≤140 — same row so THE ONE
  RULE seals it; revealed as the "In one sentence" strip;
  `late_score_session` carries it as a defaulted 3rd param); rubrics are PER
  MEMBER in `member_rubrics` (mashed client-side); personal presets in
  `user_rubrics` (one ★ favorite — it's what seed_member_rubric submits when
  the user joins/creates a group, else the app default); solo/community
  ratings in `global_ratings` (self-only RLS, aggregate via
  `title_community_score`; distribution via `title_community_histogram`, both
  SECURITY DEFINER count-only). Per-round participation in `session_rsvps`
  (in/pass; unanswered expires 24h → pass, computed at read time in
  `src/lib/rsvp.ts` — scoring always counts as in; groups of 3+ only). The
  reveal quorum mirrors it server-side: `reveal_session` needs
  least(2, eligible) locks where eligible = in + scored + unanswered-window-
  open, so a round everyone else passed on still reveals. The `interval
  '24 hours'` in the RPC must stay in sync with RSVP_WINDOW_MS.
- Discussion (`title_comments` + reactions/reports/blocks/banned_terms,
  migration 20260714120000): group threads are SEALED per member while
  their card is open (THE ONE RULE extends to words — `comments_open_for_me`
  reuses `has_locked_scorecard`); public "takes" post-gated on having rated
  (`has_rated_title`). Writes ONLY via `post_comment`/`delete_comment`
  definer RPCs (terms gate, wordlist, ban switch, depth cap). Cred =
  `group_cred` RPC (reactions received, group-scoped, flair via
  `src/lib/cred.ts` — see DESIGN.md "Reward loop law" + its DO-NOT-BUILD
  list). `profiles.banned` is dashboard-only (column-level grant).
  Client: `DiscussionSection` on TitleDetail; "Talk it out" on the reveal.
- Avatars: `profiles.avatar_key` picks one of twenty ORIGINAL movie-archetype
  SVGs (`src/components/avatars.tsx`, one `<Avatar>` recipe app-wide, initial
  circle when null). Column-narrowed update grant (display_name, avatar_key —
  banned stays dashboard-only). NEVER ship copyrighted character imagery.
- Public profiles + playlists: `group_members.is_public` (per-member
  per-group, flipped via `set_group_visibility` RPC, DEFAULT TRUE since
  2026-07-14), `playlists` + `playlist_items` (visibility rides
  `playlists.is_public`, DEFAULT TRUE for personal lists since 2026-07-16;
  items readable iff the playlist is), GROUP
  WATCHLISTS via `playlists.group_id` (members curate, creator/group owner
  manage, never public — check constraint), and the `public_profile`
  definer RPC (name + avatar + shown groups + public PERSONAL playlists —
  the ONLY shape others see; ratings are never auto-public). Friends = your
  groupmates (fetchMyFriends dedupes across groups); PublicProfileScreen +
  PlaylistScreen live on the App view-stack.
- Accounts: Confirm-email is ON everywhere; every email flow is a 6-digit
  code entered in-app (verifyOtp; templates in `supabase/templates/` show
  `{{ .Token }}` — hosted templates must match, see `docs/DOMAIN.md`).
  AuthScreen: signup→code, Forgot password→code+new password in one step.
  Profile Account section: change email (code to the NEW address only),
  change password (current-password check via signInWithPassword — App
  resets navigation only when the signed-in USER changes, so re-auth and
  token refreshes never yank the view). Danger zone → `delete_my_account`
  RPC: owned groups hand off to the longest-standing member (solo groups
  delete), cascades wipe everything personal, client then signs out
  LOCALLY (`signOutLocal` — the server no longer knows the token).
  Export (`fetchMyExport`) = solo ratings + saved + own group scorecards
  (incl. one-liners) + takes + playlists + rubric presets.
- TABS (2026-07-17 restructure): Home, Discover, Rate, Profile. The old
  Group tab MERGED into Rate; stored `mp.activeTab` value 'group' migrates
  to 'rate' in readStoredTab. The header is brand-only (no avatar button).
- `src/screens/` — Auth (password, signup codes, forgot-password codes,
  passwordless "Email me a sign-in code"), CreateGroup, Home (CROSS-GROUP
  overview: stats strip [groups/rated/saved] + live rounds w/ inline RSVP +
  latest reveals + "From your list" saved shelf + trending/popular tail),
  Discover (streaming-style shelf stack: ONE combined film+TV lineup of
  TMDB lists + genre/era/acclaim recipes + per-side "Because you rated"
  rows, lazy rect-check LazyShelf, cached via fetchShelf; search covers
  films AND shows together — no Film/TV toggle anywhere, the Type filter
  [All/Films/Shows] lives in the filter panel and persists as
  mp.discoverMedia), TitleDetail (+ add-to-playlist sheet),
  Profile — the 4th TAB (identity, groups w/ visibility toggles, playlists,
  friends, poster grids, Account section, export, Danger zone; onBack
  optional — present only when pushed on the stack),
  Group[Screen] — the RATE tab body: group switcher chips + gear that
  toggles the gear-gated settings cluster (mashed rubric + per-member
  editor, members + Manage: rename/remove/leave/delete) → SessionPanel
  (the WHOLE round lifecycle: blind → components/RoundScorer.tsx inline
  sliders/one-liner/lock/reveal-in-place; sealed; revealed w/ late score +
  backfill; session===null renders the `startRound` prop) →
  components/StartRound.tsx (dual search w/ All/Films/Shows chips + manual
  type pair + GroupInviteSheet) opened for next rounds → log → recs →
  components/GroupPoll.tsx ("What's next?" votes: owner opens 2-5 options
  via create_group_poll, members cast one switchable ballot each
  [poll_votes, self-only + open-only RLS], live tally over realtime,
  close_group_poll crowns the majority winner [ties = option order] and
  the winner rolls into GroupInviteSheet; PostgREST embeds need
  poll_options!poll_options_poll_id_fkey because the winner FK is a second
  relationship) → watchlists (content, not settings). Every round is an invite (RSVP shows
  for groups of 2+). First run shows OnboardingSlides once (`mp.onboarded`,
  live product miniatures per slide), then the app opens GROUP-LESS
  (Home/Discover/Profile work; Rate shows a NoGroupYet card) — no forced
  create-group gate — and the first signed-in landing runs FirstRunTour
  once (`mp.toured`): dims the app, pulses each tab (BottomNav `highlight`
  prop), switches to each real screen; group-holders skip slides and go
  straight to the tour. useTmdbSearch takes
  'movie' | 'tv' | 'both' and returns TaggedResult (per-item mediaType);
  PosterResultGrid consumes tagged results. Shared UI recipes (fieldClass,
  CtaButton, GroupMark, VisibilityChip, ScoreSliderRow — the one
  score-slider row, "N/10" readout) live in `src/components/ui.tsx`; the
  design system is documented in `DESIGN.md`.
- Push notifications (APNs-direct; FCM slots in when Android ships):
  `device_tokens` (self-only RLS; `register_device_token` RPC handles device
  hand-me-downs), `notification_config` (service-only singleton; EMPTY row =
  notifications off — local dev and the twins), and three triggers
  (group_added / round_started / member_locked) that `push_notify` ships via
  pg_net to the `send-push` Edge Function, which resolves names and delivers
  over APNs HTTP/2 (ES256 provider JWT). Payloads are ID-ONLY — score values
  never ride a notification (enforced in both test suites). Client wiring in
  `src/lib/push.ts` (native-only no-ops; sign-out via signOutWithPushCleanup).
- `supabase/migrations/` — schema + RLS as code (grants included — do not
  rely on platform default privileges).

## Current state (2026-07-08)

- Live on TestFlight (internal testing): repo on GitHub (alukand/mash-potato),
  Codemagic `ios-testflight` workflow builds + uploads (see `codemagic.yaml`
  + `docs/TESTFLIGHT.md`). App record Apple ID 6788610092.
- Hosted Supabase project ref: `lvmcwvhlfijvegxbqipc` (MCP config in
  `.mcp.json`) — all migrations applied, `TMDB_API_KEY` set as a dashboard
  secret, `tmdb-search` deployed (ops: search/browse/detail/genres/person/
  discover/recommendations/providers — providers = where-to-watch, JustWatch
  data, attribution shown in the UI; v12 browse feeds also top_rated/
  now_playing/upcoming, discover filters also yearFrom/To, sortBy,
  min/maxVotes, minRating; v13 adds language — Anime = 16 + 'ja'). Auth email-confirmation is OFF (no
  deep-link handling yet).
  `send-push` deployed + `notification_config` seeded on hosted; APNs secrets
  (PUSH_SHARED_SECRET / APNS_AUTH_KEY / APNS_KEY_ID / APPLE_TEAM_ID) still
  need setting in the dashboard before pushes deliver, and the App ID needs
  the Push Notifications capability (see the push setup checklist).
- Dynamic rubric (M8) shipped: `rubric_categories` + jsonb `member_scores.
  scores` + `reveal_sessions.rubric` snapshots; blind-rule suites re-proven.

## Windows gotchas (this machine)

- Docker/Supabase CLI need a PATH refresh in each new shell:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- `npx supabase functions serve` crashes (ENAMETOOLONG) — restart the stack
  instead; the built-in runtime picks up functions + `functions/.env`.
- After `supabase db reset`, the browser keeps a stale JWT — use the app's
  sign-out to recover.
- Repo must stay OUTSIDE OneDrive (Desktop is OneDrive-synced here).
