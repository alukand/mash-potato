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
  Member ratings live in `member_scores.scores` (jsonb map); rubrics are PER
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
- Public profiles + playlists (private by default in EVERY direction):
  `group_members.is_public` (per-member per-group, flipped via
  `set_group_visibility` RPC), `playlists` + `playlist_items` (visibility
  rides `playlists.is_public`; items readable iff the playlist is), and the
  `public_profile` definer RPC (name + shown groups + public playlists —
  the ONLY shape others see; ratings are never auto-public). Friends = your
  groupmates (fetchMyFriends dedupes across groups); PublicProfileScreen +
  PlaylistScreen live on the App view-stack.
- `src/screens/` — Auth, CreateGroup, Home (CROSS-GROUP dashboard: live
  rounds w/ inline RSVP + latest reveals + trending; group-agnostic),
  Discover (TMDB browse/filters), TitleDetail (+ add-to-playlist sheet),
  Profile (editable display name, groups w/ visibility toggles, playlists,
  friends, poster grids, JSON export), Rate (search → invite → blind scoring
  → lock → reveal), Group (group switcher + pinned settings gear → SessionPanel
  [blind progress / the full Reveal] → log w/ avg+best strip → mashed rubric
  with a collapsed per-member editor → members + Manage: rename / remove
  member / leave / delete, all via existing RLS — no schema changes). Every
  round is an invite (RSVP shows for groups of 2+; the header has no group
  chip — switching is Group-tab only). First run shows OnboardingSlides once
  (`mp.onboarded`), then the app opens GROUP-LESS (Home/Discover work;
  Rate/Group show NoGroupYet cards) — no forced create-group gate. Shared UI
  recipes (fieldClass, CtaButton, GroupMark, VisibilityChip, ScoreSliderRow —
  the one score-slider row, "N/10" readout) live in `src/components/ui.tsx`;
  the design system is documented in `DESIGN.md`.
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
  discover). Auth email-confirmation is OFF (no deep-link handling yet).
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
