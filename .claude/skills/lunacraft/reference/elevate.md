Assess what's flat or lifeless in a structurally sound design, then add boldness, personality, and ambition. This is the additive phase: turn "correct" into "memorable."

**Entry condition:** The design is structurally sound but visually safe, sterile, or conventional. If there are structural problems (broken layout, wrong colors, missing states, text-on-image illegibility, broken grid), run **improve** first.

**Motion-only requests:** If the only gap is missing entrances, hovers, scroll reveals, idle presence, or micro-rewards — do not run elevate (it dispatches to bolder/delight/overdrive and changes visual design). Run **polish** to lock the design, then **animate** for motion.

## Step 0: Structural gate

Before assessing intensity or personality:

1. Load [composition-guardrails.md](composition-guardrails.md).
2. Read project **`DESIGN.md`** color strategy (Restrained vs Committed, etc.). Do not override a restrained brand with "go big" defaults from [brand.md](brand.md).
3. Run the guardrails **decision tree**. If topology is wrong (overlay illegibility, broken grid, duplicate bands, split imbalance) → **stop**. Tell the user to run **improve** (layout + distill + typeset), not elevate.
4. Run **squint test** and **symmetry check** from guardrails. If they fail → stop; route to improve.

**Do not** swap section layout to a different catalog pattern (Bento, Broken Grid, overlay hero) during elevate unless the user explicitly asked to restructure.

## Step 1: Assess

Run a lightweight checklist across three dimensions before dispatching. For each dimension, inspect the target and note what's missing or weak.

### Visual intensity
- Is the palette restrained when the register and brand would support more commitment?
- Are scale jumps timid (everything medium-sized, no drama)?
- Is the hierarchy flat (nothing commands attention, everything has similar visual weight)?
- Are there decisive typographic moves, or is everything safe and generic?

**If the design feels safe or bland:**

1. On **split layouts** (main + rail/aside): run **[typeset.md](typeset.md)** first—establish weight budget and rail subordination.
2. Then dispatch **[bolder.md](bolder.md)** on the **primary column only** (see [composition-guardrails.md](composition-guardrails.md) § Rail / aside subordination). Never default to bolder inside `<aside>` / rail.

### Personality
- Are interactions sterile (functional but joyless)?
- Are success, error, loading, and empty states purely functional with no character?
- Are there moments that could surprise, reward, or delight?
- Does the interface have any memorable quality, or could it belong to any product?

**If interactions are sterile and states are generic** → dispatch to [delight.md](delight.md)

### Ambition
- Is everything conventional and competent but unremarkable?
- Could the implementation push browser capabilities further?
- Is there an opportunity for a technically impressive moment that serves the experience?

**If the design is conventional across all dimensions** → consider dispatching to [overdrive.md](overdrive.md), but only when the context warrants it (brand surfaces, portfolio, creative tools). For product UI, overdrive is rarely appropriate.

## Step 1.5: Checkpoint (topology changes only)

**Skip** this step if elevate only adjusts intensity inside an existing topology (color, type scale, micro-delight) and preserve list is unchanged.

**Required** when any pass might:
- Add or remove section bands
- Change split → overlay (or reverse)
- Apply a Composition Alternatives catalog swap from [layout.md](layout.md)

Present:

```
## Elevate preserve contract

- Topology: [what stays]
- Column ratio: [band if split]
- Max topology changes: [0 or 1 with reason]
- Subject: [photo must remain recognizable / n/a]

Confirm before structural elevation.
```

Do not proceed without user confirmation on topology-changing work.

## Step 2: Dispatch and Enhance

Based on the assessment, load the relevant internal references and apply them. Work through each reference thoroughly before moving to the next.

### Dispatch table

| Dimension | Internal Reference | What It Adds |
|---|---|---|
| Intensity | [typeset.md](typeset.md) then [bolder.md](bolder.md) | Typeset first on split sections; bolder only on primary column, within preserve contract |
| Personality | [delight.md](delight.md) | Satisfying interactions, celebration moments, copy personality, easter eggs |
| Ambition | [overdrive.md](overdrive.md) | Technically extraordinary moments: shaders, spring physics, scroll-driven reveals, View Transitions |

Multiple dimensions can be addressed in a single elevate pass. Load and apply each reference sequentially — the depth of each reference is the point.

Not every dimension needs elevation. If personality is weak but intensity is strong, only dispatch to delight.md. Let the assessment drive the dispatch, not a checklist-completion instinct.

### Browser / screenshot (opt-in — triggers visual reconcile)

Browser is **not** required to start elevate. Default path is code-first.

**If you open a browser, load a dev URL, or capture a screenshot** during this elevate pass, you **must** run **Step 2.6 Visual reconcile** before close. Screenshot without a fix wave is a failed pass.

**Opt in** for overdrive or when the user requests visual proof. Follow [overdrive.md](overdrive.md) § Iterate with Browser Automation when effects cannot be validated from source alone.

## Step 2.5: Post-elevate reconcile — code (required)

After Step 2 enhancement passes:

1. Run `node "$HOME/.claude/skills/lunacraft/scripts/load-context.mjs"` — if `projectGates` exists, follow [project-design-gates.md](project-design-gates.md) for all new markup (do not add forbidden borders/dividers).
2. Run **LunaCraft detect** ([detect.md](detect.md)) on changed markup: `node "$HOME/.claude/skills/lunacraft/scripts/detect.mjs" --json [changed paths]`. Fix P0 findings before close.
3. Run **project design gate**: `node "$HOME/.claude/skills/lunacraft/scripts/project-design-check.mjs" --json [changed paths]`. **P0 or P1 on changed files = fix** before close.
4. Run **[Reconcile checklist](composition-guardrails.md#reconcile-checklist-phase-2--verifier-pass)** on changed files.
5. Run **[Section hierarchy budget](composition-guardrails.md#section-hierarchy-budget-close-gate)** on changed files.
6. Verify preserve contract from Step 1.5 (or Step 0 for intensity-only work).
7. **No browser** during this step.

**If P0 regressions** (structure, hierarchy, rail inversion, preserve violated):

- **At most one corrective wave:** `typeset` + `distill` + `layout` as needed — **not** another `bolder` pass, **not** another full elevate.
- Re-run Steps 2.5 and 2.6 (if browser was used) once.
- Still failing → **route to improve**; stop elevate.

## Step 2.6: Visual reconcile (required if browser/screenshot used)

If Step 2 touched a browser or produced a screenshot, run **[Visual reconcile](composition-guardrails.md#visual-reconcile-tier-3--when-browser-or-screenshot-used)**:

1. Write structured P0 list from what you see (rail louder than H2, watermark zip, meta strip, phantom steps, split headline, etc.).
2. Fix via **one** corrective wave (`typeset` / `distill` only).
3. Re-run Step 2.5 code reconcile + hierarchy budget.

**Cannot close elevate** while visual P0s remain or while screenshot showed regressions you did not fix.

## Step 3: Close (hard gate)

All must pass before emitting "Elevation complete":

- LunaCraft detect (Step 2.5)
- Project design gate PASS (Step 2.5)
- Code reconcile (Step 2.5)
- Section hierarchy budget
- Visual reconcile (Step 2.6) when browser/screenshot was used
- [Closeout checks](composition-guardrails.md#closeout-checks-improve--elevate)

**Close gate:** If any check fails, do **not** mark elevate complete. Do **not** tell the user to run polish until hierarchy P0s are resolved.

Summarize what was added:

> **Elevation complete.** Added [brief list of what changed].
>
> Next step: run **polish** to lock the design, then **animate** for motion. Do not re-elevate until polish is done.

If closeout fails → route to **improve**, not another elevate pass.

Do NOT run polish automatically. The user decides the next phase.
