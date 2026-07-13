# Mash Potato — DESIGN.md

last-verified: 2026-07-12
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

Fonts: Fraunces (display + big scores), Hanken Grotesk (UI/body), Space Mono
(numeric readouts, micro-labels). Never more than these three.

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
- **Sliders** — `.mp-slider` with per-instance `--thumb` (ramp color) and
  `--fill`. Score sliders show the anchor word next to the value.
- **Section header** — 11px semibold uppercase `tracking-[0.2em]` muted label,
  optional quiet count as a mono span after the label (space only, no
  separator characters).
- **List rows** — rows never gain a hover background. Feedback lives on the
  row's own elements: title brightens to teal on hover, poster/avatar scales
  on press (`group-active:scale-95`).

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
- **Profile** — identity (editable display name) → groups → poster grids
  (Reviewed / Rated / Saved) → Your data (JSON export) → sign out (header).
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
   Deliberate disables stick (configuredCategoryKeys).
3. **Per round (binary only)**: the creator may leave a genre add-on out
   (on/off chip in the RubricReceipt, locked by the session snapshot).
   NEVER weight sliders per movie: it's a studied manipulation vector that
   would bypass the blind moat, and per-event rule-setting kills group
   momentum.

The RubricReceipt is a receipt, not a form: read-only base chips + toggleable
genre chips at creation; fully read-only on the blind card. Scoring copy sets
the intent-relative norm: "Score each part for what it's trying to be."

**Living reveals (2026-07-12):** a revealed Mashed is the score SO FAR, not a
frozen verdict. Members without a locked card (late joiners, round-sitters)
fold their scores in from the reveal panel; when the rubric grows, locked
members get a per-category backfill prompt ("The rubric grew"), and the
category joins the session snapshot append-only at the current effective
weight. Locked scores can NEVER be changed, only missing ones added — both
paths are constrained SECURITY DEFINER RPCs; direct inserts are blind-only.
Blind rounds stay fully blind: no running Mashed before the reveal, ever.

## View state

Persist by default (localStorage, `mp.*` keys): active tab (`mp.activeTab`),
active group (`mp.activeGroupId`), Discover films/TV switch
(`mp.discoverMedia`). Ephemeral on purpose: unsaved rubric edits, open
disclosures, in-flight flags.

## Tried / rejected log

- 2026-07-12: PowerShell one-liner text replacement on source files corrupts
  UTF-8 (PS 5.1 ANSI default) — mangled em dashes/ellipses; restored from git.
  Use proper editor tooling only.
- 2026-07-12: "Group name · see the reveal →" sublines rejected (middle-dot
  ban + redundant affordance text); replaced with GroupMark + name.
- 2026-07-12: hover background washes on list rows removed app-wide
  (row-highlight ban); feedback moved onto row elements.

## Changelog

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
