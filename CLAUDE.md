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
  (246 assertions across 12 files as of 2026-07-26)
- `powershell -File scripts\verify-rls.ps1` — portable-Postgres twin
  (see `scripts/verify-rls/README.md`)
- `powershell -File scripts\check-grants.ps1` — the GRANTS LAW text lint

Never put the TMDB key or service_role key in client code — TMDB goes through
the `tmdb-search` Edge Function (`supabase/functions/`; local secret in
`supabase/functions/.env`, hosted via `supabase secrets set`). The anon key is
fine client-side.

GRANTS LAW (hardening migration 20260717160000): `public` functions get NO
default execute — every new function migration must grant explicitly.
**Always name `anon` in the revoke; never rely on default privileges.** The
one true pattern (see 20260717200000_group_polls.sql):

```sql
revoke all on function public.fn(args) from public, anon;
grant execute on function public.fn(args) to authenticated;   -- client RPCs + RLS helpers
-- trigger internals instead: revoke all ... from public, anon, authenticated;  (no grant)
```

**The suites do NOT catch a missing `anon` revoke (learned the hard way,
2026-07-25, fixed in 20260725120000).** `revoke execute ... from public`
alone passed pgTAP AND the twin locally, then shipped two functions that
answered 200 to the anon key on hosted: default privileges differ between a
local `db reset` and a hosted `db push`. After deploying any function
migration, probe hosted directly — an anon-key POST to
`/rest/v1/rpc/<fn>` with valid params must return 401, and a known-good
control (e.g. `public_profile`) confirms the probe itself is sound. The
twin's `20-grants.sql` mirrors the internals list; `account_test.sql` +
the twin's 98 file assert the local posture.

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
  ordered category list. Partial-tolerant BY DESIGN: a key absent from a
  member's card drops its weight from THEIR denominator; `CategoryStat.
  raters` counts who rated it, and the united/contested headline needs ≥2
  raters (one voice can't agree or clash).
- `src/lib/rubricCatalog.ts` — the category catalog (base/optional/genre),
  DEFAULT_WEIGHTS, `mashRubrics` (per-member rubrics → effective group rubric;
  absent/disabled counts as 0), `resolveSessionRubric[Tagged]` (effective
  rubric ∪ TMDB-genre add-ons; pass `configuredCategoryKeys(raw rubrics)` so
  a category the whole group disabled stays out), and `splitRubricForMember`
  (session snapshot → my core vs extras from my member-rubric rows; no rows
  or no overlap → everything core). Animated titles (genre 16)
  relabel `cinematography` → Animation (same weight) and `acting` → Voice
  Acting at 0.85× (keys unchanged for history coherence). PRODUCT LAW
  (researched 2026-07-12, per-member since 2026-07-18, see
  DESIGN.md "Rubric cadence"): weights never change per movie — per-round
  flexibility is PER MEMBER at scoring time: genre extras are opt-in chips
  on each scorer's own card (`ExtraCategoryChips` in ui.tsx; skipped =
  absent, never 0), the full resolved rubric always ships in the snapshot,
  and `RubricReceipt` is a pure read-only receipt.
- `src/lib/mapping.ts` — jsonb `scores` / `rubric` snapshot validators.
- `src/lib/api.ts` — every Supabase call; screens never import the client.
  Member ratings live in `member_scores.scores` (jsonb map) plus an optional
  one-sentence take (`member_scores.one_liner`, ≤140 — same row so THE ONE
  RULE seals it; revealed as the "In one sentence" strip;
  `late_score_session` carries it as a defaulted 3rd param); rubrics are PER
  MEMBER in `member_rubrics` (mashed client-side); personal presets in
  `user_rubrics` (one ★ favorite — it's what seed_member_rubric submits when
  the user joins/creates a group, else the app default); solo/community
  ratings in `global_ratings` (self-only RLS; aggregates SECURITY DEFINER
  count-only — the app uses the mode-bucketed `title_mode_scores` /
  `title_mode_histogram`; `title_community_score` / `title_community_histogram`
  remain as the legacy single-pool pair). TASTE MODES (2026-07-24, DESIGN.md
  law) live in TWO places and the split matters: 'casual' ("Normies":
  Enjoyment 50 / Acting 25 / Writing 25, `CASUAL_WEIGHTS`) | 'buff'
  ("Cinephiles": base seven), display names ONLY via `TASTE_MODES` in
  rubricCatalog.ts.
  **`profiles.taste_mode` is PERSONAL** — it drives your solo card, your
  community bucket (read-time: ratings follow a switch), and preselects the
  picker when you CREATE a group. New accounts default casual.
  **`groups.taste_mode` is AUTHORITATIVE for rounds** (20260724120000,
  default 'buff' so existing groups are unchanged): `seed_member_rubric`
  reads the GROUP's mode, not the joiner's profile, so one group always has
  one rubric. Casual groups are a NO-CONFIGURATION surface: the ★ preset and
  base-coverage union are skipped, GroupScreen hides the rubric editor and
  presets, and `splitRubricForMember(..., allCore=true)` makes genre add-ons
  plain sliders instead of opt-in extras. Switching a group's mode re-seeds
  every member via the `on_group_taste_mode_changed` trigger (`reseed_group_
  rubrics`, a trigger internal — sealed from anon AND authenticated; note
  `revoke ... from public` alone does NOT cover authenticated). Past sessions
  keep their rubric snapshots. Member/user-rubrics suites pin taste_mode='buff'.
  Per-round participation in `session_rsvps`
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
  to 'rate' in readStoredTab. The header is the brand plus ONE top-right slot
  (`HEADER_ACTION_ID`); screens portal their settings control into it with
  `HeaderAction` (ui.tsx), so Rate and Profile share one findable corner.
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
  Group[Screen] — the RATE tab body: group switcher chips, with the labelled
  Settings pill in the HEADER slot toggling the settings cluster (how the
  group scores + mashed rubric + per-member editor, members + Manage:
  rename/remove/leave/delete). The cluster renders visually right under the
  header via flex `order` while staying late in the DOM → SessionPanel
  (the WHOLE round lifecycle: blind → components/RoundScorer.tsx inline
  sliders/one-liner/lock/reveal-in-place; sealed; revealed w/ late score +
  backfill; session===null renders the `startRound` prop; a
  `viewSessionId` prop shows ANY past night — GroupLog rows set it, so
  sealed/late scoring reaches every old reveal, with an "earlier night"
  banner + Back to the latest; the dot plot is colored per member with a
  name legend, and the reveal hero taps through to TitleDetail; the
  blind round carries "Wrong title? Call off this round" (`cancel_session`,
  20260726150000 — blind only, owner-or-starter, HARD delete so member_scores
  and session_rsvps cascade; the confirm counts the scorecards it discards.
  Without it a mistaken round was a trap: no delete policy exists, no second
  round can start while one is blind, and revealing needs two locked cards);
  revealed footer pairs "Rate it again" with "Start the next round" —
  re-rating is a FRESH blind round on the same title [any member, current
  rubric, one-blind-round guard, old night stays in the log; DESIGN.md
  "Re-rate rounds"], the LATEST reveal is the group's current verdict
  [TitleDetail marks older nights "an earlier round", Combined counts
  latest-per-group], and GroupInviteSheet's CTA becomes "Rate it again
  with X" via `hasGroupRatedTitle`) →
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
  once (`mp.toured`, replayable from Profile via `clearToured`): each step
  names a `data-tour` anchor (nav tabs carry `tab-<id>`, the settings pill
  carries `settings`), the tour measures that element's rect and cuts a
  SPOTLIGHT around it (transparent box + 9999px shadow spread, so it
  survives prefers-reduced-motion, which flattens `mp-tour-pulse`), and
  switches to each step's real screen; a missing anchor falls back to a
  plain dim. Group-holders skip slides and go straight to the tour.
  useTmdbSearch takes
  'movie' | 'tv' | 'both' and returns TaggedResult (per-item mediaType);
  PosterResultGrid consumes tagged results. Shared UI recipes (fieldClass,
  CtaButton, GroupMark, VisibilityChip, ScoreSliderRow — the one
  score-slider row, "N/10" readout — plus HeaderAction/SettingsButton/
  IconButton/GearIcon, the one settings affordance) live in
  `src/components/ui.tsx`; the
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
- MESSAGING (20260726120000, DESIGN.md "Messaging" law): `conversations`
  holds THREE kinds behind one id — `'group'` (the built-in chat every group
  gets from a trigger; membership IS `group_members`, nothing syncs),
  `'dm'` (the two uuid columns are the roster; a generated `dm_key` over the
  SORTED pair + unique index makes a duplicate thread impossible), and
  `'custom'` (roster in `conversation_participants`). Plus
  `conversation_state` (self-only read watermark/mute/archive),
  `messages` (soft-delete ONLY, generated tsvector), `message_reactions`,
  `message_reports`, `dm_request_declines`.
  **`is_conversation_member(uuid)` takes NO user id** — it reads
  `auth.uid()`; a `p_user_id` parameter would make it a membership oracle.
  SELECT-only policies; every write is a definer RPC (`send_message`,
  `start_dm`, `accept_/decline_dm_request`, `create_group_chat`,
  `leave_chat`, `block_user`/`unblock_user`, `mark_conversation_read`, …).
  Strangers land `pending` with ONE message; groupmates skip via
  `shares_group_with`; a DECLINE IS INVISIBLE (tombstone + the same error
  string as a block, so neither is an oracle). Blocking STOPS a DM but only
  HIDES in group chats — the UI must say the right one.
  **Realtime is the privacy boundary**: DELETE events bypass RLS, so
  messages are never hard-deleted, `conversation_participants` is NOT
  published (roster changes ride a `'system'` message), and `messages` must
  keep default replica identity. `search_my_messages` is SECURITY INVOKER on
  purpose; `my_inbox` restates visibility and must change in lockstep with
  `messages_select_member`.
- `supabase/migrations/` — schema + RLS as code (grants included — do not
  rely on platform default privileges). `powershell -File
  scripts\check-grants.ps1` lints migration TEXT for the GRANTS LAW (neither
  test suite can catch a missing `anon` revoke); migrations at or before
  20260725120000 are grandfathered.

## Current state (2026-07-08)

- Live on TestFlight (internal testing): repo on GitHub (alukand/mash-potato),
  Codemagic `ios-testflight` workflow builds + uploads (see `codemagic.yaml`
  + `docs/TESTFLIGHT.md`). App record Apple ID 6788610092.
- Hosted Supabase project ref: `lvmcwvhlfijvegxbqipc` (MCP config in
  `.mcp.json`) — all migrations applied (through 20260726150000
  cancel_session; messaging + cancel deployed 2026-07-26 via
  `npx supabase db push --linked`, which works here even though
  `supabase login` needs a TTY. Note db push ends with a pg-delta
  "failed to cache migrations catalog" cert error and exit 255 AFTER the
  migrations land — verify with list_migrations, do not re-run).
  Post-deploy probe passed: all 29 new/re-issued RPCs answer 401
  (`42501 permission denied`) to the anon key, with `GET /rest/v1/titles`
  → 200 and a nonexistent RPC → 404 proving the probe distinguishes
  outcomes. Advisors: 0 ERROR; the 54
  `authenticated_security_definer_function_executable` WARNs are this
  app's architecture (writes only via definer RPCs), not findings.
  `TMDB_API_KEY` set as a dashboard secret, `tmdb-search` deployed (ops: search/browse/detail/genres/person/
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
