Shared composition rules for **improve**, **elevate**, and **critique**. Load this file before any pass that can change section topology, media treatment, or typographic weight.

**Live mode:** Default preserve behavior in [live.md](live.md) (~90% structural fidelity) still applies. `bolder` and `layout` actions in live must consult this file before variants that change topology or media placement.

---

## Preserve contract

Before structural or elevate work, write a preserve list the user can confirm at checkpoint:

| Field | Example |
|-------|---------|
| **Topology** | "One text column + one aside image; no full-bleed text band" |
| **Column ratio** | "~55/45 text/image on desktop; stack text-first on mobile" |
| **Max new regions** | "0 new section bands; 1 topology change max if user confirms" |
| **Subject** | "Dumpster/product photo remains recognizable; not a text panel" |

If the pass would violate the preserve list, stop and route to **improve** (not elevate, not quieter).

---

## Decision tree (routing)

Run in order:

1. **Topology wrong?** (overlay illegibility, broken grid, duplicate bands, split imbalance) → [layout.md](layout.md) + [distill.md](distill.md). **Stop** before quieter or bolder.
2. **Topology OK, hierarchy flat?** → [typeset.md](typeset.md) **first** on split layouts; only then elevate → [bolder.md](bolder.md) on the **primary column** (never rail/aside by default).
3. **Topology OK, visually loud?** → [quieter.md](quieter.md) only (saturation, grain, glow, motion noise).
4. **Topology OK and locked?** → **polish** → optional **elevate** (preserve + checkpoint) → **animate**.

**Do not** route "photo covered by display type," "broken symmetry," or "too many bands" to quieter.

---

## Split media + copy

**Default for dual-weight sections** (service-area intro, story + product photo, copy + evidence image): **split screen** or aside + copy panel. Both message and photo matter; neither should become a full-bleed text slab.

**Not mandatory** for single-CTA landing heroes where typography-first or stat-first may fit the conversion job (user can override).

### Rules

- **Subject visible:** The photo's subject (product, place, person) must stay recognizable. Text must not occupy the center mass of the image.
- **Caption zone:** Short display copy belongs in a **caption zone** (bottom strip, side panel, or dedicated copy column)—not centered over the subject.
- **Scrim/gradient:** Partial scrims are mitigations, not fixes. Prefer split layout when readability requires more than a light edge gradient.
- **Mobile:** When stacking, put **content before image** unless the image is purely decorative.

### NEVER (default)

- Center-mass `text-4xl`+ display type on a full-bleed figure
- Replacing a balanced split with a single overlay hero without user request
- Second horizontal band duplicating the same story (stats + card + figure competing)

### Escape hatch

User explicitly requests text-on-image or overlay hero → document in preserve list; still run squint test and contrast check.

---

## Typographic weight budget

Per section viewport (one column at a time on split layouts):

- **One heaviest role** (`font-extrabold` / `font-bold` display or H2)—not H2 + stats + body links all bold
- **Body links:** default `font-medium` or accent color; reserve `font-bold` for true emphasis
- **Stats row:** if H2 is heavy, stats use regular/medium weight, not competing bold
- **Split headline:** one size rhythm per H2—do not shrink the first line and explode one `<span>` inside the same heading (reads as two headlines)

---

## Rail / aside subordination (prevention — Tier 1)

The **primary column owns the story**. `<aside>`, `.rail`, sidebar cards, and narrow grid tracks are **supporting**—never louder than the main `h1`/`h2`.

### NEVER in rail/aside (default)

- Display-size zip codes, route IDs, or city names as watermark/decorative type (`text-6xl`+, `text-[Nrem]`, `absolute` + huge numerals)
- Rail title larger than or equal to the section's main heading step (e.g. rail `text-h3`/`text-h4` when main is `text-h2`—rail must be **one step smaller**)
- New eyebrow/meta strip **above** the section H2 in the same column (`37354 · COUNTY ROUTE`, duplicate geo labels)
- Replacing a simple checklist with numbered `01/02/03` step tiles when items are not a true sequence (see SKILL.md phantom numbering)
- Second decorative label stack in rail that repeats geography already in H2, body, map, or footer

### Elevate / bolder scope

- **[bolder.md](bolder.md) applies to the primary column only** unless the user explicitly asks to bold the rail.
- Intensity passes: color, spacing, micro-delight in rail OK; **typographic scale drama in rail is forbidden** by default.

---

## Grid discipline

- **One `grid-template-columns` definition** per section wrapper. A second row with different `fr` tracks needs an explicit reason in the preserve list.
- **Squint test:** Blur mentally—primary, secondary, and groupings obvious in 2 seconds?
- **Symmetry check:** Near-aligned but unequal tracks read as broken; fix tracks or collapse modules.

---

## When to use quieter

| Use quieter | Do not use quieter |
|-------------|-------------------|
| Structure passes squint test | Wrong topology / overlay illegibility |
| Saturation, grain, glow, motion noise | Broken or multi-band grid |
| Competing accents after weight budget applied | Missing hierarchy (use typeset/layout) |

---

## Regression exemplar (Madisonville-style service intro)

**Good baseline:** Restrained split—copy column + aside image, one clear H2, body at normal weight, photo subject visible, no extra manifest/ticket bands.

**Improve failure pattern:** Display type on photo, bold links + bold stats stacking, redundant stat band.

**Elevate failure pattern:** Four-band grid explosion, overlay hero, competing bold modules—quieter only makes a quieter broken grid.

**Preserve pass would keep:** column topology, single story thread, image-as-aside (not text panel), weight budget (one loud role).

---

## Elevate / layout catalog

- **Elevate** must not swap to Bento, Broken Grid, or overlay hero from [layout.md](layout.md) Composition Alternatives unless the user explicitly asks to restructure.
- **Composition Rethink** in layout: if split is balanced and on-brand, tune spacing and rhythm first.

---

## Reconcile checklist (Phase 2 — verifier pass)

Run after **improve** or **elevate** has edited files. This is a **read-only verifier** pass — not a second full critique, not a browser session.

**Tools allowed:** re-read changed source files, this checklist, required **LunaCraft detect** ([detect.md](detect.md)) on edited markup paths, **project design gate** ([project-design-gates.md](project-design-gates.md)) when `.lunacraft/design.json` defines `projectGates`.

**Tools forbidden during reconcile:** new browser tabs, screenshot overlays, `lunacraft live` + `detect.js` injection, scrolling the page for visual proof. User may opt into browser on **standalone** `/lunacraft critique` only.

### Procedure

1. List files changed in this pass (diff or explicit list from the session).
2. Re-read only those files (markup + scoped CSS).
3. Run optional CLI detect on the same paths when available.
4. Compare against the **preserve contract** from checkpoint (region count, topology, column ratio).
5. Flag **new P0 regressions introduced by our passes** — not pre-existing taste issues.
6. If P0 regressions found → **one corrective wave** (smallest fix set), then re-run this checklist once. **Max 1 corrective wave.** No infinite loop.
7. If still failing after one wave → stop; report blockers; do not auto-loop.

### Structural grep signals (code-first)

Search changed section files for these patterns. Any hit on **new** code from this pass = reconcile P0 unless preserve list explicitly allowed it:

| Signal | What to search | Why it fails |
|--------|----------------|--------------|
| Second grid | Two distinct `grid-template-columns` or competing `grid-cols-*` wrappers in one `<section>` | Broken symmetry / band explosion |
| Center-mass type on image | `absolute`/`inset-0` on figure parent + `text-4xl`/`text-5xl`/`text-6xl`/`font-extrabold` on overlay copy | Subject swallowed |
| Stacked bold roles | Same viewport: `font-bold` or `font-extrabold` on H2 + body `a`/`p` + stat/metric siblings | Weight budget broken |
| Extra story band | New sibling region duplicating manifest/ticket/stat narrative after distill should have collapsed | Distill incomplete |
| Overlay hero swap | Split layout removed; full-bleed figure + gradient scrim added without user request | Topology violation |
| Banned tells | `background-clip:\s*text` with gradient; glassmorphism stacks; hero-metric template markers | SKILL.md absolute bans |
| **Rail hierarchy inversion** | Inside `<aside>` / rail class: `text-(6xl\|7xl\|8xl\|9xl)` or `text-\[[4-9]?[0-9]rem\]` on zip/route/numeric copy | Sidebar louder than story |
| **Rail overlaps copy** | `absolute` + huge `font-display`/`font-extrabold` in rail overlapping sibling text | Illegible stack (37354 watermark pattern) |
| **Meta strip above H2** | New row immediately before `h1`/`h2` with zip/route/county micro label duplicating headline geography | Silly redundant band |
| **Phantom step grid** | `01`/`02`/`03` or `Step 1` tiles replacing a flat checklist in same section | Fake sequence |
| **Split H2 span blow-up** | Same `h2`: base line small/normal + inner `span` with `text-4xl`/`text-5xl`/`text-6xl` | Broken headline rhythm |
| **Heavy role count** | More than one of `font-extrabold`/`font-black` on `h2` + rail title + stat row in one `<section>` | Weight budget broken |

Heuristic only (flag for human review, not auto-P0): image wrapper area dominated by text nodes; contrast cannot be proven from static CSS alone.

### Section hierarchy budget (close gate)

Before **improve Step 5 close** or **elevate Step 3 close**, run the hierarchy rows in the table above on changed files. **Any P0 = FAIL.** Do not mark the command complete. Fix in one corrective wave (`typeset` + `distill`; never another `bolder` pass).

---

## Visual reconcile (Tier 3 — when browser or screenshot used)

Run when **any** of these happened in the same elevate/improve session:

- Browser automation, live page, or dev-server URL was opened for this target
- A screenshot was captured for verification
- User asked for visual proof

**Purpose:** Screenshot is **evidence that triggers fixes**, not proof for the user only ([ProofShot-style human review is insufficient for agent close](https://github.com/AmElmo/proofshot)). Bounded loop per [design-loop](https://github.com/tonymfer/design-loop): score → fix → re-check, **max one** corrective wave.

### Visual reconcile procedure

1. From screenshot or browser snapshot, list **P0 hierarchy issues only** (not taste). Use this rubric:
   - Rail or sidebar type larger or more dominant than main headline?
   - Decorative numeric/geo type overlapping or competing with labels?
   - Redundant geography band above or beside the title?
   - Phantom numbered steps where a checklist existed?
   - Split headline with mismatched sizes in one phrase?
   - More than one “loud” weight competing in the same viewport?
2. Map each P0 → **typeset** or **distill** (not `bolder`, not `quieter`).
3. Apply fixes in **one corrective wave**.
4. Re-read changed files + run **Reconcile checklist** (code) again.
5. Optional: one more screenshot. If P0s remain → **FAIL close**; route to **improve**; report blockers.

**Max one visual corrective wave.** Do not infinite-loop.

### When to skip visual reconcile

- Improve/elevate used **code + detect only** and did not open a browser or capture a screenshot → code reconcile is enough.
- Standalone `/lunacraft critique` may use browser for the **report**; fixing happens in a later `improve` command (which then runs visual reconcile if browser is used there).

### Reconcile exit

- **PASS:** No new P0 from checklist + detect; preserve contract intact → proceed to improve/elevate close.
- **FAIL (one wave used):** Document what remains; route to **improve**; block **elevate**.
- **FAIL (after one wave):** Stop; user decides next command.

Link from [improve.md](improve.md) Step 4 (code reconcile), Step 4.5 (visual reconcile when browser/screenshot used), and [elevate.md](elevate.md) Steps 2.5–2.6.

---

## Closeout checks (improve / elevate)

Before closing improve or elevate on a media-heavy section:

1. Squint test passed?
2. Symmetry / single-grid discipline passed?
3. Image subject still recognizable?
4. Preserve contract honored?
5. **Reconcile checklist** passed (no new P0 regressions from this pass)?
6. **Section hierarchy budget** passed (rail subordination + weight budget)?
7. **Visual reconcile** passed (if browser/screenshot was used this session)?

If any fail → do not suggest elevate; route remaining work to improve. **Do not mark improve/elevate complete** while hierarchy P0s remain.
