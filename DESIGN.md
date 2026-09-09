# Mash Potato — DESIGN.md

last-verified: 2026-09-08
register: product (mobile app UI; design serves the task)

The audience scene: a friend group on their couches, phones in hand, scoring a
movie blind and waiting for the Reveal to drop. Dark theme is scene-driven
(evening, living-room light, next to a playing TV), not a category reflex.

## Locked identity (do not renegotiate)

- One Mashed score per title, ALWAYS teal, always labelled "Mashed".
- Personal/weighted numbers are gold; low scores and divergence are coral.
- Score ramp 1→10 coral→gold→lime lives in `src/lib/scoreColor.ts` (with
  `scoreWord`: brutal / rough / fine / great / all-timer anchors).
- The blind Reveal and disagreement-as-headline (most united + most contested
  category, per-category outlier) are the product's moat.
- Single ~480px mobile column, floating pill bottom nav.

## Tokens (`src/index.css` `@theme` — LOCKED)

| Role | Token | Value |
|---|---|---|
| Background | `--color-bg` | `#15121b` |
| Card surface | `--color-surface` | `#1e1926` |
| Raised surface / fields | `--color-surface-2` | `#271f31` |
| Hairline | `--color-line` | `#352b42` |
| Text | `--color-text` | `#f3eee5` |
| Muted | `--color-muted` | `#9c93ab` |
| Personal | `--color-gold` | `#e7b24e` |
| Mashed / group | `--color-teal` | `#51c5be` |
| Low / divergence | `--color-coral` | `#e07a5f` |
| Ramp top | `--color-lime` | `#c9d14e` |

Fonts: Bricolage Grotesque (display + big scores — warm, characterful, and
deliberately NOT the cinematic-condensed reflex a movie app invites), Hanken
Grotesk (UI/body), Azeret Mono (numeric readouts, micro-labels; tabular by
nature). Never more than these three. Bricolage carries true tabular
numerals under `.tabular`, verified 2026-07-13 — count-ups don't shimmy.

Atmosphere: body carries a teal/gold radial wash + fixed film grain
(`body::after`); cards use `.mp-card` (gradient fill, hairline border, inner
top highlight, deep ambient shadow). Poster tiles add `.mp-poster-grain`.

## Component recipes (one source: `src/components/ui.tsx`)

- **Fields** — `fieldClass` / `fieldClassSm`: surface-2 fill, `border-line`,
  teal focus border. Never re-declare per file.
- **Primary CTA** — `<CtaButton tone="gold|teal">`: gradient pill + lift
  shadow + `active:scale-[0.98]`. Gold = act (start / score / lock);
  teal = the group's moment (reveal / save rubric / I'm in). Size and width
  are set at the call site.
- **Quiet actions** — bordered pill (`border-line`, muted text) that brightens
  text or border on hover; destructive intent shifts to coral
  (`hover:border-coral/50 hover:text-coral`), confirmed destructive fill is
  `bg-coral/90` with bg-colored bold text.
- **Shape vocabulary** — people are CIRCLES (avatar palette by join order,
  `lib/palette.ts colorForMember`); groups are TILES (`<GroupMark>`,
  `rounded-md`, `colorForGroup` hash). Status chips are full pills with a
  1.5px dot. Don't cross these.
- **Avatars** — one recipe: `<Avatar>` in `components/avatars.tsx`. A picked
  movie-archetype portrait (twenty ORIGINAL flat two-tone SVGs — the
  vampire, the shark, the astronaut…) or the classic initial circle when
  none is picked. LAW: never ship copyrighted character imagery (App Review
  5.2); every portrait is from the movies, not from any movie. Picker lives
  on the Profile identity block.
- **Sliders** — `.mp-slider` with per-instance `--thumb` (ramp color) and
  `--fill`. Score sliders show the anchor word next to the value.
- **Section header** — 11px semibold uppercase `tracking-[0.2em]` muted label,
  optional quiet count as a mono span after the label (space only, no
  separator characters).
- **List rows** — every tappable row carries `transition-colors
  active:bg-surface-2`, plus the finer touches: title brightens to teal on
  hover, poster/avatar scales on press (`group-active:scale-95`), and a
  trailing chevron where the row opens something.
  **AMENDED 2026-07-26.** This rule used to read "rows never gain a hover
  background; feedback lives on the row's own elements" — and that is what
  produced the bug: hover never fires on iOS, so on the target platform a
  posterless row gave *zero* feedback on tap. Thirteen rows across the app
  were affected. A press background is the only cue that works on touch.

## Copy rules

- No em dashes in UI copy (commas, colons, semicolons, periods, parentheses).
  The `—` glyph appears only as a null-data placeholder (missing year/score).
- No middle-dot separators anywhere; separate with commas, spacing + a
  type/color shift, or a `w-px` divider element.
- Numbered labels only for true sequences (the MashMath walkthrough).
- Voice: warm, direct, second person. Empty states teach the next step.
- Motion: `mp-rise` staggered entrances; everything collapses under
  `prefers-reduced-motion`. Ease-out only, 150–1100ms; the ScoreRing count-up
  is the one long beat.

## Screen composition

- **Home** — cross-group dashboard: live rounds (inline RSVP) → latest
  reveals → quiet/explore tail. Group-agnostic; no group chip in the header.
- **Group** — the story order: switcher chips (GroupMark + name) → the round
  (SessionPanel) → the memory (GroupLog + avg/best strip) → the identity
  (mashed rubric + collapsed personal editor) → the admin corner (members +
  Manage: rename, remove w/ inline confirm, leave/delete w/ inline confirm).
  No account actions here.
- **Profile** — identity → Add friends / Personal rubrics shortcuts → personal
  rubric library → groups → playlists → friends → poster grids. Account, export,
  and sign-out stay in header Settings. Friends explains shared-group membership
  and offers an inline owner-group picker with search; no owned group offers
  create-group or asks the existing owner.
- **Group shortcuts** — Add friends (owner only) and Edit my rubric sit directly
  below the group switcher. Add friends opens in place outside Settings, with
  existing friends as suggestions and display-name search. Non-owners see who
  can add people. Simple groups show How this group scores instead of an editor.
- **Personal rubrics** — Profile owns create, rename, edit, copy, favorite, and
  confirmed delete, favorite first then A–Z. The same `RubricRowsEditor` handles
  category toggles, weights, and accessible up/down reordering in both Profile
  and Group. A preset is a reusable starting point for Cinephile groups, never
  the solo card. Editing one preserves its id and favorite; a copy never
  overwrites a namesake. Group offers Load a saved rubric before the sliders,
  Save group weights for future rounds, and Save a copy to personal rubrics.
  Hiding Profile's library preserves its draft while the screen stays mounted.
- Management always happens inline (disclosures, inline confirms), never on
  detour pages. Destructive confirms are two-step, in place, coral-framed.

## Rubric cadence (product law, research-backed 2026-07-12)

Weights live on the GROUP and never change per movie. Three layers, matching
how healthy group rituals set rules everywhere (fantasy leagues, Olympic
diving's published difficulty table, game-jam N/A opt-outs):

1. **Per group ("season")**: the mashed member rubrics — renegotiated at
   boundaries (new member, rubric retro), never at round time.
2. **Per genre (automatic)**: genre add-on categories resolve from TMDB
   genres via the catalog table; the group consented to the table once.
   Deliberate disables stick (configuredCategoryKeys). Animated titles
   (TMDB genre 16) swap two base categories for the round: Cinematography
   BECOMES Animation (same weight) and Acting becomes Voice Acting at
   0.85× — keys never change, so scores and history stay coherent; only
   labels and weights shift. The animation add-on only stands in when the
   group carries no Cinematography row to relabel.
3. **Per member, per card (2026-07-17)**: genre add-ons are EXTRAS — each
   member decides on their OWN scorecard whether to rate one ("Extras, if
   you want them" chips under the sliders, `ExtraCategoryChips` in ui.tsx).
   A skipped extra simply isn't on that member's card: their weighted score
   is computed without its weight (never a phantom 0), the category row
   averages only its raters and wears an "(n/m)" partial marker, and the
   backfill nag only covers categories the member's own rubric carries
   (`splitRubricForMember`). Nobody decides for the table — the creator's
   old per-round opt-out chip is gone. NEVER weight sliders per movie:
   it's a studied manipulation vector that would bypass the blind moat,
   and per-event rule-setting kills group momentum.

The RubricReceipt is a PURE receipt, never a form: every chip read-only,
genre add-ons marked teal with "everyone picks their own extras" copy.
Scoring copy sets the intent-relative norm: "Score each part for what it's
trying to be."

**One voice can't headline (2026-07-17):** THE REVEAL's most-united /
most-contested pick only considers categories at least TWO members rated
(`CategoryStat.raters`); a single-rater extra has range 0 by definition and
would otherwise always win "United on…". No qualifying category → no
headline block.

**Living reveals (2026-07-12):** a revealed Mashed is the score SO FAR, not a
frozen verdict. Members without a locked card (late joiners, round-sitters)
fold their scores in from the reveal panel; when the rubric grows, locked
members get a per-category backfill prompt ("The rubric grew"), and the
category joins the session snapshot append-only at the current effective
weight. Locked scores can NEVER be changed, only missing ones added — both
paths are constrained SECURITY DEFINER RPCs; direct inserts are blind-only.
Blind rounds stay fully blind: no running Mashed before the reveal, ever.

**Sealed reveals (2026-07-13):** the reveal opens PER MEMBER — you see the
group's scores only once your own card is locked (RLS-enforced), so late
scoring is genuinely blind. Sealed surfaces show a lock + "Sealed" (never a
bare dash): the reveal panel becomes the seal card with blind sliders and
"Lock in and open the reveal"; log and Home rows swap the Mashed number for
the lock mark.

**Re-rate rounds (2026-07-18):** locked scores never change, so a changed
mind gets a FRESH blind round on the same title. "Rate it again" sits on
every revealed panel (any member, any past night from the log) and the
invite sheet's CTA becomes "Rate it again with X" when the group has
mashed the title before. The new round snapshots the group's CURRENT
rubric, one blind round at a time still holds, the old night stays in the
log untouched, and the LATEST reveal is the group's current verdict:
TitleDetail marks older nights "an earlier round" and the Combined row
counts one Mashed per group. Discussion re-seals by itself while the new
round is blind (`comments_open_for_me` spans every session of the
group+title pair). Solo ratings are the editable side of the same coin:
one rating per person per title, edited in place (the action chip reads
"Solo N · Edit").

**One-line takes (2026-07-17):** the blind card carries one optional
sentence — "In one sentence, what was it about?" (`member_scores.one_liner`,
140 max) — and the Reveal drops the sentences together in an "In one
sentence" strip (leaderboard order, quote rows, hidden when nobody wrote
one). Two 8s can hide opposite readings; this is where that shows. The
column rides the scorecard row, so THE ONE RULE seals it with no new
policies; late scorers pass it through `late_score_session`. Never required,
never a math input, no push/cred/reactions attached (reward-loop law).
Source idea: theme-compression from film analysis (reduce the movie to one
sentence to find what it's about) turned into a blind-then-reveal mechanic.

**Debrief seeds (2026-07-17):** "Talk it out" seeds the composer with a
category-aware ask-why prompt (DISCUSS_SEEDS in SessionPanel, keyed by
category KEY with the label interpolated so Animation / Voice Acting read
right — e.g. Pacing: "Where did it drag for you, and where did it fly?").
Generic "Defend your take…" stays as the fallback for unmapped categories.

## View state

Persist by default (localStorage, `mp.*` keys): active tab (`mp.activeTab`),
active group (`mp.activeGroupId`), Discover films/TV switch
(`mp.discoverMedia`). Ephemeral on purpose: unsaved rubric edits, open
disclosures, in-flight flags.

## Tried / rejected log

- 2026-07-13: Fraunces (display) and Space Mono (mono) rejected — both sit on
  the fonts.md reflex-reject list (converged AI defaults), and the owner
  flagged the type system as "don't love it". Bebas-style cinematic condensed
  also rejected: "movie app → film-poster font" is the first-order category
  reflex. Landed on Bricolage Grotesque + Azeret Mono; Hanken Grotesk stays.

- 2026-07-12: PowerShell one-liner text replacement on source files corrupts
  UTF-8 (PS 5.1 ANSI default) — mangled em dashes/ellipses; restored from git.
  Use proper editor tooling only.
- 2026-07-12: "Group name · see the reveal →" sublines rejected (middle-dot
  ban + redundant affordance text); replaced with GroupMark + name.
- 2026-07-12: hover background washes on list rows removed app-wide
  (row-highlight ban); feedback moved onto row elements.

## Reward loop law (discussion, researched 2026-07-14)

Cred is PEER-GIVEN (reactions received on your group-thread comments, never
points for posting), GROUP-SCOPED, and COSMETIC: flair milestones only
(Seasoned 10, House Critic 50, Cult Classic 200 — `lib/cred.ts`), plus one
ephemeral per-thread "Top take" chip (most-reacted, 2+ reactions, recomputed
live, accumulates nowhere). Reactions are positive-only: 👍 Like, 😂 Funny,
🔥 Hot take. Disagreement's channel is the scores, not a dislike button.

DO NOT BUILD (documented failure modes: Snapstreaks, Duolingo guilt, Reddit
karma farming, Stack Overflow rep, YouTube dislike mobs): streaks of any
kind, global karma numbers or leaderboards, public dislike counts, credit
penalties, points-for-volume, guilt notifications, paid restores.

Discussion shapes: group threads are the DEBRIEF (they open with the
reveal; sealed per member while their card is open — the blind rule extends
to words); the public surface is GATED TAKES (post once you've rated,
Letterboxd shape, never a free-for-all forum — IMDb/RT precedent). The
"Talk it out" CTA on the reveal seeds the composer with the clash headline.
Compliance kit everywhere: report (3 hide), block (both ways), wordlist at
post time, ban switch, first-post house-rules sheet, support contact on the
Profile.

## Notification copy

Push notifications follow the copy rules (no em dashes, no middots, every
word earns its place) and the two-line shape: title = who did what
("Sam locked in scores"), body = what it means for you ("Dune is waiting on
the rest of Friday Film Club."). Score values NEVER appear in a notification;
the reveal happens in the app, not on the lock screen.

## Privacy model (public profiles, 2026-07-13; revised 2026-07-16)

PUBLIC BY DEFAULT, opt-out per item (the owner's call, 2026-07-14/16): a
public profile shows display name, avatar, group memberships, and personal
playlists — each group and each playlist can still be hidden with its own
toggle. Ratings, reviewed, and saved are NEVER auto-public; sharing scores
happens through the community number, never the profile. GROUP WATCHLISTS
never leave the group (structurally: they cannot be made public; an insert
trigger pins them private). Friends are simply your groupmates — no follow
graph. Visibility chips share one vocabulary: globe + teal = public,
lock + muted = private.

**What a shared card may carry (2026-07-25):** the group name, the title, the
MASHED score, the clash headline, and counts (`N scored`, `spread`). Never a
member name, never an individual score. Your group's number is yours to post;
your friend's 3/10 is not yours to publish, and they never agreed to it. This
is enforced by shape, not by care: `renderRevealCard` takes a
`RevealCardInput` of aggregates only, so there is no code path from a
scorecard to the image. Any future share surface must be built the same way —
never by screenshotting a DOM that has personal data in it.

**Onboarding (2026-09-09):** signed-out Discover stays open, with a gold
Get started button and a visible sign-in/create-account action. The terms
agreement precedes the single email form. Email links use PKCE and retain a
six-digit code fallback; password sign-in remains secondary.

New accounts get two real actions, persisted per account: choose a name and
save a favorite rubric, then automatically join the suggested starter group
and see a joined confirmation. Only the curated Test Group 1 is suggested.
Saving comes before joining so the favorite seeds the member's group rubric.
Skipping customization uses defaults and still joins the starter group.
Existing accounts keep their normal landing page. The tab tour remains
available on Profile; it no longer interrupts the first signed-in screen.

Group owners can make a group searchable in Rate > Settings. Only the group
name, taste mode and member count are public. Joining is immediate for signed-in
users; private groups stay invite-only. Owner removal prevents self-rejoining.
This never changes the per-member blind Reveal boundary.

## Taste modes (Normies and Cinephiles, 2026-07-24)

Two scoring styles, one community. `profiles.taste_mode` stores neutral
values ('casual' | 'buff'); every display string lives in TASTE_MODES
(`rubricCatalog.ts`), so a rename never needs a migration. Casual is the
Normie card: Enjoyment 50, Acting 25, Writing 25 — enjoyment is deliberately
HALF the card, that's the mode's whole point. Buff is the Cinephile card:
the base-seven craft rubric at DEFAULT_WEIGHTS.

- New accounts default casual; the migration backfilled existing accounts to
  buff so nobody's card changed under them. Onboarding gained a picker slide
  where the miniature IS the choice (two mini scorecards, preselected
  Normie); Profile's "How you score" section switches anytime.
- **The mode lives in two places, and the split is the law (2026-07-24).**
  `profiles.taste_mode` is PERSONAL: your solo card, your community bucket,
  and the preselected choice when you CREATE a group. `groups.taste_mode` is
  AUTHORITATIVE for rounds. One group, one rubric.

  Why it moved: personal modes mashing inside one group INVERTED the mode
  they were supposed to express. With 1 Normie among 3 Cinephiles,
  mashRubrics averaged Enjoyment (50, counted 0 for the three) down to 12.5,
  making the Normie's heaviest category the LIGHTEST slider on their own
  card, while every Cinephile grew an `enjoyment` extras chip nobody asked
  for. Note what was NOT the problem: a Normie rating generously and pulling
  the Mashed up is DISAGREEMENT, which is the product — the Reveal exists to
  headline exactly that. The bug was rubric coherence, and a group running
  two rubrics is two definitions of "a good movie", which contradicts the
  moat.

- **Normie groups are a no-configuration surface.** Everyone carries the same
  three rows; the ★ preset and base-coverage union are skipped at seed time;
  GroupScreen hides the rubric editor and presets entirely; and the whole
  resolved rubric is core (`splitRubricForMember(..., allCore)`), so a genre
  night's Humor is a plain slider rather than something to opt into. Cinephile
  groups keep the full per-member machinery, untouched. A Cinephile in a
  Normie group scores that group's three: the group's call, and the point.
  Switching a group's mode is owner-only and re-seeds every member (a DB
  trigger on the column, so no path can change the mode without re-seeding);
  the two-step coral confirm names the cost. Past rounds keep their snapshots.
- Every title shows BOTH crowds. `title_mode_scores` /
  `title_mode_histogram` bucket raters by their CURRENT mode and score each
  rater under their own mode's weights — your ratings follow you when you
  switch sides; "what does each crowd think" is asked at read time.
  Aggregate-only, grants-law compliant (anon executes neither).
- `seed_member_rubric` follows the GROUP's mode (casual three / base seven,
  with the ★ preset honoured in buff groups only). Suites: pgTAP 167
  (taste_modes_test 11 + group_taste_modes_test 12), twin 96 + 96b. The
  member-rubrics and user-rubrics tests pin taste_mode='buff' — they test
  the buff path; the casual path lives in the taste-mode files.

## Messaging (DMs, group chats, custom chats — 2026-07-26)

Three container kinds behind one `conversations` id, and the kind decides
where membership comes from:

- **`'group'`** — the built-in chat every Mash Potato group gets (created by
  a trigger, backfilled for existing groups). It has NO roster of its own:
  membership *is* `group_members`, so nothing syncs and leaving the group
  leaves the chat on the next statement.
- **`'dm'`** — the two uuid columns are the roster. `dm_key`, a generated
  column over the SORTED pair with a unique index, makes a second thread for
  the same two people structurally impossible.
- **`'custom'`** — an arbitrary roster in `conversation_participants`.

**One helper, and one line to defend forever.**
`is_conversation_member(uuid)` takes **no user id** — it reads `auth.uid()`
itself, exactly like `is_group_member`. Adding a `p_user_id` parameter would
turn a SECURITY DEFINER function into a membership *oracle* any signed-in
user could query about any conversation. Never add one.

**The request gate.** Strangers land `pending` and get exactly ONE message
(plus a cap of 10 pending requests per 24h); groupmates skip the gate via the
server-side `shares_group_with`. Replying IS accepting. **A decline is
invisible**: it writes a tombstone the requester cannot read, the thread
stays visible to them, and their next send fails with *the same string as
being blocked* — so neither the UI nor the error is an oracle for "they
declined you". `dm_request_declined` is sealed from `authenticated` for the
same reason. `create_group_chat`/`add_chat_participants` enforce
`can_message_directly` per invitee: that predicate is the whole
anti-harassment story, and loosening it re-opens the gate's back door.

**Blocking stops a DM but can only hide in a group chat** — both people
legitimately belong in the room. The UI must say "they can't message you"
for DMs and "you won't see their messages" for group chats, or people will
believe they are protected when they are not. `unblock_user` + `my_blocks`
finally exist (the delete policy shipped in 2026-07-14 with no client path).

**REALTIME IS THE PRIVACY BOUNDARY HERE**, not a convenience as it is for
comments — and two consequences are permanent:

- **DELETE events bypass RLS.** Postgres ships only replica-identity columns
  on delete and Realtime cannot evaluate a policy against them, so every
  subscriber to a published table receives every delete. Therefore messages
  are **soft-deleted only**, `conversation_participants` is **deliberately
  not published** (leave_chat deletes rows, which would broadcast the
  roster — roster changes ride a `'system'` message instead), and
  `REPLICA IDENTITY FULL` must never be set on `messages`.
- `messages_select_member` is what Realtime evaluates per subscriber, so it
  must be self-sufficient from the row alone. It is: everything derives from
  `conversation_id` + `sender_id`.

`search_my_messages` is deliberately **SECURITY INVOKER** so RLS stays the
single source of truth. `my_inbox` and `conversation_read_receipts` can't be
(they aggregate), which makes them the highest-risk future bug: **if
`messages_select_member` changes and their CTEs don't, previews and unread
counts will leak a blocked or removed message.** Change them together.

Suites: pgTAP 239 (messaging_test 72), twin adds 98b (12 assertions). New
guard `scripts/check-grants.ps1` lints migration TEXT for the GRANTS LAW —
neither suite can catch a missing `anon` revoke, because local `anon` has no
baseline function grant, which is exactly how an open endpoint shipped on
2026-07-25.

## Changelog

- 2026-09-08 (friends and rubric discoverability): visible Add friends actions
  on Profile and Rate, a shared member picker with existing-friend suggestions,
  and a Profile library for editing, renaming, copying, and favoriting personal
  rubrics. One category editor adds touch-friendly reordering and weight shares.
  Group loading and saving explicitly distinguish presets from group weights.
  No schema, scoring, blind-read, or signed-out access changes.

- 2026-07-27 (the landing page becomes a marketing page): `web/index.html`
  rebuilt from a one-screen pitch into a six-movement page. **Register note:
  this file's `register: product` governs the APP; `web/` is BRAND register**
  and takes brand permissions (display type to 57px, a signature interaction,
  long scroll) while staying inside the locked palette and the three fonts.
  Narrative spine is Journey: the page is one movie night, agree -> rate blind
  -> Reveal -> argue.
  - **Signature element:** the Reveal is *performed by the visitor* — a
    checkbox + label flips a sealed panel into five positioned member dots,
    the teal Mashed number and the united/split headline. Pure CSS, because
    `_headers` ships `script-src 'none'`; a real `<input>` also gets keyboard
    operation for free.
  - **Imagery is drawn, not screenshotted.** Real captures would ship a dev
    database (Anime Club, E2E Film Club) and go stale on the next UI change;
    the CSS artifacts are built from these tokens so they cannot drift.
  - **Tried and rejected:** hero eyebrow chip above the H1 (banned pattern,
    detect flagged it, removed); teal box-shadow glow on the CTA (AI-tell,
    swapped for a neutral shadow); all-caps mono on 30+ character strings
    (that is body copy in costume, set in sentence case); an invisible ghost
    em-dash holding the blind Mashed slot (1.1:1 is not a design, it is dead
    ink — the grid cell already reserves the height).
  - **Deviation from detect, argued not ignored:** five `low-contrast`
    findings pair `.dot b` (muted) with the dot's fill because `b` nests
    inside `.dot`. It is positioned `top:-20px`, i.e. OUTSIDE the circle on
    the card, where the real ratio is 5.87:1. Verified numerically rather
    than waved away.

- 2026-07-27 (the app gets an address): the browser build always existed —
  Capacitor only wraps `dist/` — so the work was the three things a web app
  needs and a wrapped one does not. **URLs**, via `lib/urlState.ts`: not a
  router, a serialiser, because the view model is already a stack and browser
  history is a stack. Every screen is now linkable, refresh keeps your place,
  and Back means back. This is also what makes the share card finish its job:
  a posted image with nowhere to click was a dead end. **A landing page**
  (`web/`, static, no build step, deliberately not the app bundle) at the apex
  with the app on `app.mashpotato.app`. **A social identity**: OG tags, a
  manifest, and `maximum-scale=1.0, user-scalable=no` removed from the
  viewport — blocking pinch-zoom is an accessibility failure on the web in a
  way it is not inside a native shell. Security headers ship with it
  (`public/_headers`), CSP verified in ENFORCING mode against a live session
  rather than assumed.

- 2026-07-27 (launch hardening — see `docs/SECURITY.md`): an audit of actual
  privileges on HOSTED, rather than of the migrations, found three write/read
  surfaces open and one missing ceiling. `titles` accepted an INSERT from any
  signed-in user with arbitrary `name`/`poster_path` and is globally readable
  (a route to put text in front of strangers, which is what App Store 1.2
  polices); it also had UPDATE granted on every column, inert only because no
  policy existed. `profiles` handed every signed-in user the whole row,
  including `banned` — an oracle for who has been sanctioned. And nothing put
  a ceiling on write volume. Title writes now go through `ensure_title`
  (validates shape, holds MANUAL titles to the comment wordlist); profiles
  keeps its permissive row policy but re-grants only the columns the app
  reads; and `consume_rate_limit` backs BEFORE INSERT triggers plus the TMDB
  proxy. The limiter FAILS OPEN, because a rate limiter that takes browsing
  down when it breaks is worse than the abuse it prevents. Suites: pgTAP 270,
  twin +9. Hosted advisors: 0 ERROR, and `rls_policy_always_true` is gone.

- 2026-07-25 (the group's whole run, availability, and a card you can post):
  three features drawn from a competitive read of Letterboxd and the
  group-picking category. (1) **Group history** — `lib/affinity.ts` computes
  agreement ACROSS nights: your taste twin, your foil, the category a pair
  always clashes on, and the group's recap. Third-party tools exist purely to
  compute Letterboxd compatibility, and all of them produce one blunt
  percentage because a star rating is all they have; per-CATEGORY scores on
  films watched together are the thing nobody else can copy. Every claim is
  floored — a pair needs three shared nights, a category needs two, the same
  discipline as `raters >= 2` in `mostUnitedCategory`. **No member standings
  table**, per the reward-loop law: the viewer sees their own tilt against the
  group and nobody else's. Costs nothing extra to fetch — `fetchGroupLog`
  already loaded every card and threw them away.
  (2) **Where to watch, at the decision point** — `WhereToWatchLine` on
  StartRound's picked card and on poll ballots, because "it's not on anything
  we have" is what actually kills movie night. Not on poster grids: N tiles
  would mean N calls, and a tile already leads to the title page.
  (3) **Share the Reveal** — a canvas-drawn 1080x1350 card. **Drawn, never
  screenshotted**, and that is the privacy design: the card is composed from
  an explicit `RevealCardInput` of aggregates, so member names and individual
  scores physically cannot reach the image. A preview sheet shows the real
  card before it leaves. See the privacy model below.

- 2026-07-26 (messaging, phases 2-6): the client, the message centre, share
  cards, moderation, and push. The envelope in the header carries an unread
  dot; the inbox shows requests first, then conversations by activity; threads
  render grouped bubbles, day separators, reactions, quote-replies, "Seen",
  and share cards that tap through to the title. `ShareToChatSheet` sends a
  film or playlist from TitleDetail. Moderation: block from a DM (with copy
  precise enough to be honest — a block STOPS a DM but only HIDES in a group
  chat), a **Blocked people** list with Unblock in Profile (closing a gap open
  since 2026-07-14), report-a-message, and a house-rules gate asked UP FRONT
  rather than caught from an error string. Push: `new_message` with an
  ID-only payload; the Edge Function resolves the text server-side and skips
  the sender, anyone who muted, and either side of a block. Suites: pgTAP 250
  (push_triggers 18, +4 asserting no message text and no body/preview field
  ever rides a payload).
  Closing the messaging work: **search** (Postgres FTS, debounced 300ms; hits
  REPLACE the inbox sections so "nothing matches" never reads as an empty
  inbox) and **typing indicators** — the app's first realtime that is not
  postgres_changes. Typing is broadcast on a PRIVATE channel
  `typing:<conversation_id>`, and privacy is not the topic name: two RLS
  policies on `realtime.messages` run `is_conversation_member` against the id
  parsed from `realtime.topic()`, proven both ways (a member subscribes, a
  non-member and a signed-out client both get `Unauthorized`). Keystrokes are
  never a table — a row each would be WAL traffic and dead tuples on the
  hottest path in the product. The twin stubs `realtime.messages` +
  `realtime.topic()` so the migration replays verbatim on vanilla Postgres
  and 98b can execute the predicate itself (messaging assertions 12 → 15).
- 2026-07-26 (a way out, and a defect sweep): **a mistaken round used to be a
  trap.** `reveal_sessions` has no delete policy (a client delete silently
  no-ops), both entry points are disabled while a round is blind, and the
  only exit was `reveal_session` — which needs TWO locked scorecards. So
  clearing a wrong title required two people to score a film they hadn't
  watched, or deleting the group. `cancel_session` (definer RPC, blind-only,
  owner-or-starter, hard delete with member_scores/session_rsvps cascading)
  plus a "Wrong title? Call off this round" control whose confirm counts the
  scorecards it will discard. Two limits stated in the copy and here: the
  round_started push is already sent and cannot be recalled, and cancelling
  reopens the title's discussion thread (comments_open_for_me reads session
  state) — correct, since the round never happened, but not obvious.
  Sweep from a full-app audit: **the reduced-motion guard killed duration but
  not animation-delay**, and with `fill-mode: backwards` that held the hidden
  from-state through every delay — one line repaired ~53 staggered sites
  where reduced-motion users watched blank space then a snap. Thirteen rows
  got a press background (see the amended List rows rule). **The JSON export
  could never work on iOS**: the clipboard write happened after an await, so
  it had lost user activation and threw in WKWebView every time. Confirms
  added to the two genuinely irreversible actions (Reveal, Rate it again) and
  to Close the vote; the preset "Delete?" finally got a Keep, and applying a
  preset now guards unsaved edits like its App-default sibling. Retry buttons
  on the Home and round errors (both used to blank the screen permanently).
  Real bugs fixed: the "N/M locked" counter was frozen while you were still
  scoring, reactions had no busy guard, `handleStartWinner` swallowed its own
  failure, add-a-friend could double-insert, and switching Discover's Type
  filter silently wiped every selected genre. Tap targets expanded on the
  worst offenders (onboarding dots were 6×6px). pgTAP 239 → 246.
- 2026-07-26 (messaging, phase 1 — the data layer): conversations /
  conversation_participants / conversation_state / messages /
  message_reactions / message_reports / dm_request_declines, with
  SELECT-only policies and ~24 SECURITY DEFINER RPCs carrying the
  post_comment validation ladder (signed-in → banned → terms → length →
  wordlist → scope → parent). See the law above. `delete_my_account` was
  re-issued: without an explicit custom-chat handoff a deleted user's
  participant row cascades away and leaves a conversation with ZERO
  participants — invisible to everyone and impossible to open, leave, or
  delete. Both suites green, plus the new grants lint.
- 2026-07-25 (findable settings, readable rubric, a tour that points): four
  discoverability fixes, no schema change.
  **Settings** got one home: the app header gained a right-hand slot
  (`HEADER_ACTION_ID` + the `HeaderAction` portal in ui.tsx) and both Rate and
  Profile render the same LABELLED `SettingsButton` into it. The Rate gear was
  an unlabelled 14px cog pinned to the end of the scrolling group-chip strip,
  where it read as one more chip, and it opened a panel ~1000px down the page;
  the cluster now sits directly under the header (flex `order`, same DOM).
  Profile had no settings control at all: How you score, Account, Your data,
  Sign out and Danger zone now live behind its gear, content stays in flow.
  The Members cog is "Manage", not a second "Settings". New shared recipes:
  `IconButton`, `GearIcon` (the cog path was duplicated verbatim).
  **The group log** rows always reopened that night's full Reveal, but nothing
  said so: hover-only teal never fires on iOS and a 5% poster shrink was the
  sole touch cue (absent on posterless rows). Added a chevron, a whole-row
  press state, and a "Tap any night to reopen its Reveal" caption. Sealed rows
  now read "Score to open" so a tap that lands on the scoring gate is expected.
  **The rubric editor** stopped hiding its own arithmetic: each row shows
  "you 30 → 18", the mashed card is badged Preview while your edits are
  unsaved, the copy names the divide-by-every-member rule and says only ratios
  matter, sliders got end caps, disabled rows keep their number, "Add
  categories" became rows with visible blurbs (the definition was a `title=`
  tooltip no touch device shows) and genre tags, and App-default / preset
  delete became two-step like every other destructive action here.
  **The tour** can now point at anything: steps carry a `data-tour` anchor,
  the scrim became a real spotlight (a transparent box at the measured rect
  with a 9999px shadow spread), and copy went directive. Profile gained
  "Replay the walkthrough" — `mp.toured` was write-only, so nobody could ever
  see it twice.
- 2026-07-24 (one group, one rubric): the taste mode moved onto the GROUP for
  rounds (`groups.taste_mode`, default buff so nothing changed under existing
  groups) — see the law above for the dilution bug that forced it. Group
  creation grew a mode picker (`TasteModePicker` in ui.tsx, one recipe shared
  with the group settings switcher); GroupScreen leads its settings cluster
  with "How this group scores" and hides the rubric editor in Normie groups;
  the invite sheet badges the mode. `splitRubricForMember` gained an `allCore`
  flag. Onboarding's pick is now HANDED to CreateGroupScreen rather than
  re-fetched (the profile write raced the fetch and preselected the stale
  mode). GRANTS LAW gotcha found by the twin: a new trigger internal needs
  `revoke ... from public, anon, authenticated` — `from public` alone leaves
  authenticated able to execute it.

- 2026-07-24 (taste modes): Normies and Cinephiles shipped (see the law
  above). New `enjoyment` catalog category (optional kind). TitleDetail's
  community card became the two-crowd grid (your crowd wears a gold "you"
  chip) with an Everyone / Normies / Cinephiles histogram filter; the solo
  card follows your mode (3 or 7 sliders). Onboarding grew the picker slide
  (TasteMock: selectable live miniatures); Profile grew "How you score".
  api.ts: fetchModeScores / fetchModeHistogram / fetchMyTasteMode /
  updateMyTasteMode replace the single-pool community fetches.
- 2026-07-18 (changed minds): re-rate rounds + editable solo ratings (see
  the "Re-rate rounds" recipe above). SessionPanel's revealed footer pairs
  "Rate it again" with "Start the next round" (guarded by the one-blind-
  round rule, works from any past night via the log, resolves genre extras
  fresh from TMDB); GroupInviteSheet detects a prior reveal
  (hasGroupRatedTitle) and swaps its CTA + reassurance copy; TitleDetail
  verdicts mark superseded nights "an earlier round" and Combined counts
  latest-per-group (two nights from one group no longer fake a second
  verdict). The solo chip now reads "Solo N · Edit" so editing is
  discoverable. Reveal headline edge: when one category wins BOTH crowns
  (all shared ranges equal — common with two members), the "United on X.
  Split over X." lie becomes "Same wavelength, every category." (range 0)
  or "Split by N, every category."
- 2026-07-18 (extras are yours to pick): genre add-ons stopped being the
  creator's call — the RubricReceipt is now a pure receipt (opt-out chips
  gone; the full resolved rubric always ships in the snapshot) and every
  scorer picks their own extras on their card via "Extras, if you want
  them" chips (ExtraCategoryChips in ui.tsx, add at 5 / remove drops the
  key). splitRubricForMember (rubricCatalog) splits the snapshot into your
  core vs extras from your member rubric rows; a skipped extra is simply
  absent — weighted score computed without its weight, category rows
  average raters only with an "(n/m)" marker, the backfill nag covers only
  categories YOUR rubric carries, and locking needs ≥1 scored category.
  THE REVEAL's united/contested headline gained a two-rater floor
  (CategoryStat.raters) so a single-voice extra can't crown "United on…".
  Blind, sealed, and open-late cards all share the same treatment.
- 2026-07-18 (sheets anchor to the viewport): mp-rise (and mp-grow-x /
  mp-pop) switched from fill-mode `both` to `backwards` — retained fills
  compute to an identity transform, which made every animated section the
  containing block for position:fixed, so overlay sheets (group invite,
  avatar picker, playlists) opened a page or two below the viewport.
  `backwards` keeps the pre-delay hidden state and releases at rest (the
  to-state equals natural style, so the release is invisible). LAW: any
  entrance animation wrapping a fixed overlay must not retain its fill.
  Push routing also scrolls to top so a notification tap visibly lands on
  the round even when already on that tab.
- 2026-07-18 (any night, anyone's color): log rows reopen THAT night's
  full reveal in the panel (SessionPanel viewSessionId + fetchSessionById,
  "An earlier night from the log" banner with Back to the latest) — which
  fixes late scoring being trapped on the newest reveal: the sealed card
  and late_score_session now reach every past round. The category dot
  plot colors every dot by member (colorForMember, your dot ringed) and
  the old you/others legend became a per-member name legend + group-mean
  marker. The reveal hero (poster/title) taps through to the title page.
- 2026-07-18 (onboarding): slides rebuilt as live product miniatures
  (see Onboarding recipe above) + the first-run tab tour (FirstRunTour,
  BottomNav highlight prop, mp.toured). New keyframes mp-grow-x, mp-pop,
  mp-tour-pulse in index.css, all under the reduced-motion kill.
- 2026-07-17 (anime + group votes): "Anime" joined Discover — not a TMDB
  genre, so it's the Animation+Japanese recipe (tmdb-search v13 discover
  filter `language` → with_original_language): Anime films / Anime series
  shelf rows plus a synthetic Anime chip in the filter panel (negative id,
  expands to 16 + 'ja'). Groups got "What's next?" votes: the owner lines
  up 2-5 titles (group-watchlist quick-picks + dual search), members cast
  one switchable vote with a live tally (realtime) and voter avatars, the
  owner closes it (majority wins, ties break by option order) and the
  winner rolls into GroupInviteSheet to start the round. Schema:
  group_polls / poll_options / poll_votes with composite FKs so votes and
  winners can only point at options of their own poll, one open poll per
  group, RPC-only poll writes, self-only open-only ballots. Suites: pgTAP
  144 (+14 group_polls_test), twin +14 (99-poll-test). PostgREST note:
  the winner FK creates a second polls↔options path — embeds must hint
  poll_options!poll_options_poll_id_fkey.
- 2026-07-17 (tab restructure + one search + passwordless): the Group tab
  merged INTO Rate — the third tab is now the whole ritual: switcher chips,
  the round in place (SessionPanel grew the blind scoring via RoundScorer;
  the Reveal flips in place instead of bouncing to Home), StartRound
  (search + invite) when there is no round or via "Start the next round",
  the log, recs, and watchlists; the group ADMIN (rubric + members +
  manage) hides behind the gear as a settings cluster. Profile replaced
  Group as the 4th tab (header avatar button removed; back button only
  when stack-pushed). Film/TV toggles are gone everywhere: one search box
  covers both (useTmdbSearch 'both', interleaved TaggedResults), narrowing
  moved into filters (Discover panel Type chips, StartRound inline chips,
  manual entries get a tiny Film/Show pair); Discover's stack became ONE
  mixed film+TV lineup (41 rows) and lost its intro copy. Auth gained
  passwordless "Email me a sign-in code" (signInWithOtp + magic_link
  template; Google/Apple documented as a credential-gated checklist in
  docs/SOCIAL-LOGIN.md). Home became an overview: stats strip
  (groups/rated/saved), "From your list" shelf, popular-shows tail.
- 2026-07-17 (accounts + hardening): full account management shipped.
  Signup now completes with a 6-digit emailed code (fixes the hosted
  stuck-signup; Confirm email stays ON), Forgot password = code + new
  password in one step, Profile gains an Account section (change email
  via code to the new address, change password with current-password
  check) and a Danger zone (type-DELETE account deletion; owned groups
  hand off to the longest-standing member, solo groups delete, App
  Review 5.1.1(v) satisfied). Export now covers group scorecards +
  one-liners, takes, playlists, and rubric presets. Security: all
  definer functions stripped from anon, trigger internals sealed from
  authenticated (push_notify is unforgeable), search_path pinned,
  future functions get no default PUBLIC execute (grant explicitly in
  every new migration!). App only resets navigation when the signed-in
  USER changes — token refreshes no longer yank the view. Suites: pgTAP
  130 (new account_test 15), twin +15 (98-account-test). Advisors 69→27
  findings (rest intentional or dashboard-only; see docs/DOMAIN.md).
- 2026-07-17 (Discover shelf stack): Discover browses like a streaming
  home. Per-side lineups (25 film rows / 16 TV rows) mixing TMDB lists
  (trending, popular, in theaters / on the air, coming soon, top rated),
  genre rows, era rows (90s, 80s), acclaim recipes (Hidden gems with an
  aged-two-years cutoff, Acclaimed thrillers) and a personalized "Because
  you rated {title}" row seeded from your latest rating on that side. Rows
  lazy-load via a rect-check LazyShelf (no IntersectionObserver: parked
  webviews can starve it and rAF), empty rows collapse, recipes cache 10min
  in api.ts (fetchShelf). tmdb-search v12: browse feeds top_rated /
  now_playing / upcoming + discover era/acclaim filters (yearFrom/To,
  sortBy rating|newest, minVotes/maxVotes/minRating).
- 2026-07-17 (one-line takes + debrief seeds): the blind card gains an
  optional one-sentence take ("In one sentence, what was it about?",
  `member_scores.one_liner`) that drops with the scores in a Reveal strip;
  sealed by the same row RLS, carried by `late_score_session` (new defaulted
  param, drop+recreate). "Talk it out" now seeds category-aware ask-why
  prompts (relabel-safe). Both suites extended (pgTAP 115, twin 32).
- 2026-07-16 (playlists travel): the add-to-playlist sheet's create row
  gains a destination picker (Personal or any group's watchlist), and every
  playlist you can see gets "Save a copy" (to your lists or a group) —
  duplication is how lists are shared between people and groups
  (duplicatePlaylist in api.ts; existing RLS covers every path).
- 2026-07-16 (playlists default public): personal playlists now default to
  public (existing ones backfilled); the per-list toggle stays, group
  watchlists stay pinned private via an insert trigger. Suites updated
  (pgTAP friends 25, twin 10). Profile copy updated.
- 2026-07-14 (group watchlists + public default): shared watchlists on the
  Group tab (playlists.group_id: every member curates, creator or group
  owner manages, never public — check-enforced), group lists ride the
  add-to-playlist sheet with a GroupMark, PlaylistScreen shows the group
  context. Group memberships now default to PUBLIC on profiles (existing
  rows backfilled); the per-group hide toggle stays. Suites updated (pgTAP
  friends 23, twin 9).
- 2026-07-14 (avatars): profile avatars shipped. Twenty original
  movie-archetype portraits (flat two-tone SVGs, `components/avatars.tsx`)
  + the initial-circle default; picker on the Profile identity block;
  `profiles.avatar_key` (self-editable column grant), avatars ride
  public_profile, members, friends, discussion bylines, the reveal outlier,
  and the lock-progress row (locked members' faces arrive). Both suites
  extended (pgTAP 103, twin +1).
- 2026-07-14 (discussion): per-title discussion shipped. Group threads
  (the debrief; sealed per member with the blind rule, "Talk it out" on the
  reveal) + public gated takes (rate first), 👍😂🔥 reactions, Mash Cred
  flair (peer-given, group-scoped, milestones only), Top take chip, and the
  full compliance kit (report/block/filter/ban/terms/support contact).
  Research-backed (Hooked, Contagious/STEPPS, IMDb/RT graveyard, Apple 1.2);
  both RLS suites extended (pgTAP 130, twin +14).
- 2026-07-14 (invite picker + settings): "Invite" never assumes the active
  group anymore. GroupInviteSheet (bottom-sheet dialog) opens from TitleDetail
  and Rate: recently engaged groups float to the top (mp.recentGroupIds MRU,
  touched on switch and round start), the list is searchable past 4 groups,
  and picking a group shows THAT group's rubric receipt (genre opt-outs,
  live-blind-round guard) before the round starts; starting switches the app
  to that group. Group settings got discoverable: a pinned gear next to the
  switcher opens the admin corner (rename, add/remove members, leave, delete)
  and the tiny "Manage" text became a gear-labelled Settings pill.
- 2026-07-13 (clarity pass): score readouts are "N/10" everywhere via the
  shared ScoreSliderRow (ui.tsx, one recipe for all five scoring surfaces).
  CategoryLegend disclosure ("What the categories mean", catalog blurbs) on
  Rate, the Group rubric, and the solo panel. TitleDetail's group verdicts
  gain an "All your groups / Combined" row (mean of visible Mashed, 2+
  verdicts). Notification taps deep-link to the group's round (ID-only
  routing keys in the APNs payload; send-push v6). Reading-copy floor
  raised one step (11→12, 12→13; mono micro-labels untouched). First run:
  five swipeable onboarding slides (state-driven transform carousel)
  replace the forced create-group gate; the app opens group-less with
  NoGroupYet cards on Rate and Group.
- 2026-07-13 (review pass): 8-angle code review over the uncommitted work,
  10 confirmed findings fixed. Reveal quorum is now RSVP-aware (a round
  everyone else passed on reveals with one card; unanswered invites hold it
  only while the 24h window is open — server + client). SessionPanel gained
  a real loading state (no more sealed-card flash), per-session state resets,
  and seeds late/sealed sliders from your unlocked blind draft. A base-six ★
  preset now gains missing base categories on join (server union + repair
  backfill), and the rubric editor offers missing base categories.
  TitleDetail history shows the Sealed lock (was a teal dash). VisibilityChip
  extracted to ui.tsx (3 sites); colorForUser joins the palette for friend
  avatars; the reveal headline swaps faux italic for true semibold + color.
  Playlists: covers fetched with per-list server limits, updated_at moved to
  a DB trigger, playlist toggles patch state locally, Enter-key double-create
  guards. Suites: pgTAP 70, twin 28 blind-rule assertions.
- 2026-07-13 (friends + playlists): public profiles (per-group visibility
  toggles, definer RPC), playlists with per-list visibility, add-to-playlist
  sheet on TitleDetail, Friends section, PlaylistCard/PosterGrid shared
  components. Suites extended (pgTAP +14, twin +5).
- 2026-07-13 (sealed): Reveals open per member — RLS hides everyone's scores
  until your own card is locked. Seal card with blind sliders on the panel;
  lock marks in the log and Home lists. Both suites extended (pgTAP 23,
  twin 25).
- 2026-07-13: Type system re-picked (Bricolage Grotesque / Hanken Grotesk /
  Azeret Mono). Emotional Impact joins the base seven at weight 25; Humor and
  Fear Factor become HEAVY genre add-ons (35) that carry their nights. Reveal
  now needs a second locked scorecard in multi-member groups. Group switching
  stays on the Group tab, which gains a "Because you loved X" rec shelf.
- 2026-07-12 (push): APNs notifications for group adds, round invites, and
  groupmate locks. Permission asked at sign-in; foreground alerts enabled
  (presentationOptions) since mid-round is when the app is open.
- 2026-07-12 (living reveals): Mashed scores stay open after the reveal —
  late scoring for members without a locked card, per-category backfill
  prompts when the rubric grows, snapshot grows append-only, partial-coverage
  markers in the category breakdown. Both RLS suites extended and green.
- 2026-07-12 (later): Rubric-cadence decision shipped after 3-track market
  research (fixed group rubric wins on psychology, friction, and integrity;
  per-movie weights rejected). Added RubricReceipt (creation + blind card),
  binary genre add-on opt-outs, intent-relative scoring copy; fixed the
  disabled-by-everyone genre re-add bug via configuredCategoryKeys.
- 2026-07-12: Enhance pass (lunacraft). Extracted `ui.tsx` primitives
  (fieldClass, CtaButton, GroupMark); group management shipped (rename,
  remove member, leave, delete — all RLS-backed, no schema changes); profile
  display-name edit + JSON export; Group tab reordered (round → log → rubric
  → members/manage), sign-out consolidated to Profile; score-anchor words on
  sliders; group log memory strip (avg + best); middle-dot and em-dash copy
  sweeps; tab + Discover media persistence. Market research (Letterboxd/IMDb/
  RT/Trakt/TV Time/Beli) drove: scale anchors, export-your-data, group-memory
  stats, no streaks/no invite-gating confirmed.
