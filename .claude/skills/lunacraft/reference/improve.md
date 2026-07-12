Diagnose structural and functional design issues, present findings at a checkpoint, then fix everything the user confirms. This is the corrective phase: find what's broken or weak and repair it.

**Entry condition:** Something is wrong, missing, or weak in the design. Structural problems, not creative flatness (that's elevate).

Load [composition-guardrails.md](composition-guardrails.md) before Step 1 diagnosis so media, grid, and weight issues map correctly.

**Project design gates:** Run `node $HOME/.claude/skills/lunacraft/scripts/load-context.mjs` once at the start. If the project has `.lunacraft/design.json` → `projectGates`, treat that guidance as binding for this pass (see [project-design-gates.md](project-design-gates.md)). Other projects: no extra rules.

## Step 1: Diagnose (code-first default)

Load [reference/critique.md](critique.md) and execute its diagnostic flow: Assessment A (LLM design review on source files) and Assessment B (**LunaCraft detect** — [detect.md](detect.md) — on markup paths when they exist). **Do not skip detect** because the user did not ask for it; it is part of improve.

**Assessment C (project design gate):** On the target path(s), run [project-design-gates.md](project-design-gates.md). Include any **P0/P1** (forbidden borders, white-reading hairlines) in the checkpoint as issues to fix — this catches **existing** violations before edit.

**Improve loop policy:** Use **code + detect only** for diagnosis inside improve. Do **not** open browser tabs, inject `detect.js`, or require `[Human]` overlays during improve — unless the user explicitly asks for visual proof in this session.

For standalone `/lunacraft critique`, browser overlay remains opt-in per critique.md.

The diagnostic produces: heuristic scores, AI slop verdict, priority issues with severity tags, persona red flags, and minor observations.

## Step 2: Checkpoint

Present a **concise summary** to the user. Do NOT dump the full critique report.

Format:

```
## Issues Found (N total)

1. **[P0] <one-line title>** — will fix via <internal reference>
2. **[P1] <one-line title>** — will fix via <internal reference>
3. **[P2] <one-line title>** — will fix via <internal reference>
...

## Preserve (if media/grid section)

- Topology: [e.g. split text + aside image]
- Media: [subject must stay visible; no center-mass display type on photo]
- Weight: [one heaviest role per column]

Confirm to fix all, or strike any items you want to skip.
```

Each line maps the issue to the internal reference that will address it using the dispatch table below. Keep it to one line per issue — severity tag, title, and which pass will handle it.

If the user wants the full diagnostic detail, tell them to run `critique` separately.

## Step 3: Dispatch and Fix

After the user confirms, work through the fixes in **sequential focused passes**. Load one internal reference at a time, apply it thoroughly to the target, then move to the next.

**Dependency order (structural P0s):** When multiple structural issues exist, run passes in this order — not severity roulette:

1. **distill** — remove duplicate bands/modules first
2. **layout** — topology, split media, grid
3. **adapt** — responsive / touch targets
4. **typeset** — weight budget, hierarchy
5. **colorize** — palette/contrast
6. **clarify**, **harden**, **optimize**, **onboard** — as diagnosed
7. **quieter** — **only last**, and only if squint test already passes

Track which files each pass edits; you need that list for Step 4.

Each pass:
1. Load the internal reference file
2. Follow its assessment and implementation instructions for the specific issues it needs to address
3. Complete the pass before moving to the next reference

Do NOT try to fix everything in one combined pass. The depth of each reference file is the point — each pass gets full attention.

### Dispatch table

Map each diagnosed issue to the internal reference that addresses it:

| Issue Category | Internal Reference | Example Findings |
|---|---|---|
| Photo illegibility, display type over image, split-column imbalance | [layout.md](layout.md) + [composition-guardrails.md](composition-guardrails.md) | Text on subject, split collapsed to overlay, column ratio broken |
| Rail louder than main H2, watermark zip in aside, meta strip above title | [typeset.md](typeset.md) + [distill.md](distill.md) | 37354-style numerals, redundant geo band, split-headline span blow-up |
| Phantom `01/02/03` replacing checklist | [distill.md](distill.md) + [layout.md](layout.md) | Fake sequence tiles on non-sequential facts |
| Bold H2 + bold body + bold stats competing | [typeset.md](typeset.md) + [composition-guardrails.md](composition-guardrails.md) | Weight stacking, links and stats all bold |
| Too many bands/cards/CTAs in one section | [distill.md](distill.md) | Manifest + ticket + figure + stat band duplicating one story |
| Color misuse, weak palette, contrast failures | [colorize.md](colorize.md) | Wrong color strategy, poor contrast, gray-on-color, pure black/white |
| Typography hierarchy, font issues, readability (not weight budget) | [typeset.md](typeset.md) | Flat type scale, generic fonts, poor line length |
| Layout, spacing, rhythm, composition, grid monotony | [layout.md](layout.md) | Equal spacing everywhere, card grid monotony, weak visual hierarchy |
| Complexity, clutter, information overload | [distill.md](distill.md) | Too many elements, no progressive disclosure, competing actions |
| UX copy, labels, error messages, jargon | [clarify.md](clarify.md) | Vague errors, technical jargon, unclear CTAs, missing context |
| Responsive, device adaptation, touch targets | [adapt.md](adapt.md) | Mobile overflow, tiny touch targets, hover-only affordances |
| Performance, load time, jank, bundle size | [optimize.md](optimize.md) | Layout thrashing, large images, missing lazy loading, CLS |
| Saturation, grain, glow, motion noise (structure OK) | [quieter.md](quieter.md) | Too saturated, too many effects — **not** overlay illegibility or broken grid |
| Production gaps, edge cases, i18n, overflow | [harden.md](harden.md) | Missing error states, text overflow, no i18n support |
| First-run, empty states, onboarding | [onboard.md](onboard.md) | Blank empty states, no first-use guidance, missing activation flow |

If an issue doesn't map cleanly to one reference, use the closest match. If multiple references are needed for the same issue, run them sequentially.

## Step 4: Reconcile (required)

After Step 3 passes complete, run the **[Reconcile checklist](composition-guardrails.md#reconcile-checklist-phase-2--verifier-pass)** in verifier mode:

1. Re-read **only files changed** in Step 3.
2. Run **LunaCraft detect** ([detect.md](detect.md)): `node "$HOME/.claude/skills/lunacraft/scripts/detect.mjs" --json [changed paths]`. If engine missing, run `npm install --prefix "$HOME/.claude/skills/lunacraft"` once, then retry. **Cannot close** if detect was skipped on changed markup files.
3. Run **project design gate** ([project-design-gates.md](project-design-gates.md)): `node "$HOME/.claude/skills/lunacraft/scripts/project-design-check.mjs" --json [changed paths]`. **P0 = FAIL** — fix forbidden patterns, re-run once. **P1** on the target section: fix white-reading hairlines per project `guidance`.
4. Compare to preserve contract from Step 2 checkpoint.
5. Run **[Section hierarchy budget](composition-guardrails.md#section-hierarchy-budget-close-gate)** (rail subordination, phantom steps, split H2, weight budget).
6. Flag **new P0 regressions we introduced** (second grid, center-mass type on image, preserve broken, rail inversion, weight stacking returned).

**No browser** during this step unless you are about to run Step 4.5. No second full critique report.

**If reconcile finds new P0s:** run **at most one corrective wave** (`typeset` / `distill` / `layout` — not `bolder`), then re-run reconcile + hierarchy budget **once**. If still failing → stop and report; do not loop again.

**If reconcile passes:** proceed to Step 4.5 (if needed) then Step 5 close.

## Step 4.5: Visual reconcile (required if browser/screenshot used)

If this improve session opened a browser, loaded a dev URL, or captured a screenshot for the target:

1. Run **[Visual reconcile](composition-guardrails.md#visual-reconcile-tier-3--when-browser-or-screenshot-used)**.
2. Fix P0s in **one** corrective wave (`typeset` / `distill` only).
3. Re-run Step 4 code reconcile + hierarchy budget.

**Cannot close improve** while visual P0s remain. Screenshot-only proof without fixes is a failed pass.

Skip Step 4.5 when improve used code + detect only (default).

## Step 5: Close (hard gate)

All must pass:

- LunaCraft detect ran on all changed markup (Step 4)
- Project design gate PASS — no P0; P1 on target fixed (Step 4)
- Reconcile checklist (Step 4)
- Section hierarchy budget
- Visual reconcile (Step 4.5) when browser/screenshot was used
- [Closeout checks](composition-guardrails.md#closeout-checks-improve--elevate)

**Do not mark improve complete** while hierarchy P0s remain.

Summarize what was changed:

> **Structural fixes complete.** Fixed N issues across M passes: [brief list]. LunaCraft detect: PASS. Project design gate: PASS. Reconcile: PASS. Hierarchy budget: PASS. Visual reconcile: PASS / skipped (code-only).
>
> Ready for **polish**. Optional **elevate** only after polish when structure is sound — never elevate while overlay/grid/rail P0s remain.

Do NOT run polish automatically. The user decides the next phase.
