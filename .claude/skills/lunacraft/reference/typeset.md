Typography carries most of the information on the page. Replace generic defaults (Inter, Roboto, system fallback at flat scale) with type that reflects the brand and scales with intentional contrast.

---

## Register

Brand: run the font selection procedure in [brand.md](brand.md). Pairing follows the brand's lane (display serif + sans body for editorial/luxury, one committed sans for tech, etc.). Fluid `clamp()` scale, ≥1.25 ratio between steps.

Product: system fonts and familiar sans stacks are legitimate here. One well-tuned family typically carries the whole UI. Fixed `rem` scale, 1.125–1.2 ratio between more closely-spaced steps.

---

## Assess Current Typography

Analyze what's weak or generic about the current type:

1. **Font choices**:
   - Are we using invisible defaults? (Inter, Roboto, Arial, Open Sans, system defaults)
   - Does the font match the brand personality? (A playful brand shouldn't use a corporate typeface)
   - Are there too many font families? (More than 2-3 is almost always a mess)

2. **Hierarchy**:
   - Can you tell headings from body from captions at a glance?
   - Are font sizes too close together? (14px, 15px, 16px = muddy hierarchy)
   - Are weight contrasts strong enough? (Medium vs Regular is barely visible)

3. **Sizing & scale**:
   - Is there a consistent type scale, or are sizes arbitrary?
   - Does body text meet minimum readability? (16px+)
   - Is the sizing strategy appropriate for the context? (Fixed `rem` scales for app UIs; fluid `clamp()` for marketing/content page headings)

4. **Readability**:
   - Are line lengths comfortable? (45-75 characters ideal)
   - Is line-height appropriate for the font and context?
   - Is there enough contrast between text and background?

5. **Consistency**:
   - Are the same elements styled the same way throughout?
   - Are font weights used consistently? (Not bold in one section, semibold in another for the same role)
   - Is letter-spacing intentional or default everywhere?

**CRITICAL**: The goal isn't to make text "fancier." It's to make it clearer, more readable, and more intentional. Good typography is invisible; bad typography is distracting.

## Weight budget

When improve or critique flags **competing bold** (H2 + body links + stats all heavy):

- **One heaviest role** per section viewport (or per column on split layouts): pick display/H2 OR stats OR emphasis links—not all three at bold/extrabold
- Demote body links to `font-medium` or accent color without bold
- Stats beside a bold H2 use regular/medium weight
- Consult [composition-guardrails.md](composition-guardrails.md) for per-column rules

Weight budget fixes belong here before routing to quieter or **bolder**.

## Rail / aside subordination (split layouts)

When the section has a main column + `<aside>` / rail / sidebar card:

1. **Main column owns the H2** — one consistent size rhythm; never shrink the first line and explode one `<span>` inside the same `h2`.
2. **Rail type is one step smaller** than the section headline (e.g. main `text-h2` → rail labels `text-h4` / `text-sm`, not `text-h3` competing with the story).
3. **Remove or demote** decorative zip/route numerals in the rail (`text-6xl+`, absolute watermarks). Geography belongs in the headline or body once—not in a meta strip above H2 **and** rail **and** footer.
4. **Checklists stay flat** unless the content is a true ordered procedure; do not swap to `01/02/03` tiles for independent facts.
5. Before [bolder.md](bolder.md) runs in elevate, typeset must pass **Section hierarchy budget** in [composition-guardrails.md](composition-guardrails.md).

## Plan Typography Improvements

Consult the [typography reference](typography.md) for detailed guidance on scales, pairing, and loading strategies.

Create a systematic plan:

- **Font selection**: Do fonts need replacing? What fits the brand/context?
- **Type scale**: Establish a modular scale (e.g., 1.25 ratio) with clear hierarchy
- **Weight strategy**: Which weights serve which roles? (Regular for body, Semibold for labels, Bold for headings, or whatever fits)
- **Spacing**: Line-heights, letter-spacing, and margins between typographic elements

## Improve Typography Systematically

### Font Selection

If fonts need replacing:

Before browsing externally, consult [fonts.md](fonts.md) for a curated catalog of 80+ fonts organized by role and industry. Filter by the project's register — in brand register, skip fonts tagged `[BR]` (reflex-rejected training-data defaults).

- Choose fonts that reflect the brand personality
- Pair with genuine contrast (serif + sans, geometric + humanist), or use a single family in multiple weights
- Ensure web font loading doesn't cause layout shift (`font-display: swap`, metric-matched fallbacks)

### Establish Hierarchy

Build a clear type scale:
- **5 sizes cover most needs**: caption, secondary, body, subheading, heading
- **Use a consistent ratio** between levels (1.25, 1.333, or 1.5)
- **Combine dimensions**: Size + weight + color + space for strong hierarchy. Don't rely on size alone
- **App UIs**: Use a fixed `rem`-based type scale, optionally adjusted at 1-2 breakpoints. Fluid sizing undermines the spatial predictability that dense, container-based layouts need
- **Marketing / content pages**: Use fluid sizing via `clamp(min, preferred, max)` for headings and display text. Keep body text fixed

### Fix Readability

- Set `max-width` on text containers using `ch` units (`max-width: 65ch`)
- Adjust line-height per context: tighter for headings (1.1-1.2), looser for body (1.5-1.7)
- Increase line-height slightly for light-on-dark text
- Ensure body text is at least 16px / 1rem

### Refine Details

- Use `tabular-nums` for data tables and numbers that should align
- Apply proper `letter-spacing`: slightly open for small caps and uppercase, default or tight for large display text
- Use semantic token names (`--text-body`, `--text-heading`), not value names (`--font-16`)
- Set `font-kerning: normal` and consider OpenType features where appropriate

### Weight Consistency

- Define clear roles for each weight and stick to them
- Don't use more than 3-4 weights (Regular, Medium, Semibold, Bold is plenty)
- Load only the weights you actually use (each weight adds to page load)

**NEVER**:
- Use more than 2-3 font families
- Pick sizes arbitrarily; commit to a scale
- Set body text below 16px
- Use decorative/display fonts for body text
- Disable browser zoom (`user-scalable=no`)
- Use `px` for font sizes; use `rem` to respect user settings
- Default to Inter/Roboto/Open Sans when personality matters
- Pair fonts that are similar but not identical (two geometric sans-serifs)

## Verify Typography Improvements

- **Hierarchy**: Can you identify heading vs body vs caption instantly?
- **Readability**: Is body text comfortable to read in long passages?
- **Consistency**: Are same-role elements styled identically throughout?
- **Personality**: Does the typography reflect the brand?
- **Performance**: Are web fonts loading efficiently without layout shift?
- **Accessibility**: Does text meet WCAG contrast ratios? Is it zoomable to 200%?

When the type carries the hierarchy on its own, this pass is complete. The calling workflow determines the next step.

## Font Tasting Mode

When multiple strong font pairings are viable and the user wants to compare visually — or when the user explicitly asks to test fonts — apply this mode instead of committing to a single pairing.

### Activation

Tasting mode activates when:
- The user asks to compare, test, try, sample, or taste fonts
- The user runs `/lunacraft typeset` and current fonts are generic defaults
- `improve` dispatches here specifically for generic or default font issues (not scale, weight, spacing, or readability issues), and 2+ viable pairings exist from the catalog

### Procedure

1. Read the project brief and register. Consult [fonts.md](fonts.md).
2. Select up to 3 pairings (headline + body font). For each, write one sentence explaining why it fits this project. If only 2 strong candidates exist, use 2.
3. Count the page's sections. Divide them into 3 roughly equal groups. If fewer than 3 sections, reduce to 2 pairings (one per section). If only 1 section, apply the top recommendation and list alternatives 2 and 3 as options the user can request by name.
4. Add `<link>` tags (Google Fonts or Fontshare API) for all fonts across all 3 pairings to the document `<head>`.
5. Apply each pairing to its section group via scoped CSS:
   - Group A (sections 1-N): `font-family` overrides for pairing 1
   - Group B (sections N+1-M): overrides for pairing 2
   - Group C (sections M+1-end): overrides for pairing 3
6. At the top of each group's first section, insert a visible label:
   ```html
   <div class="font-tasting-label">FONT TASTING — Pairing [A/B/C]: [Headline Font] + [Body Font]</div>
   ```
   Style the label: small, muted, fixed position relative to the section top. Not part of the design — scaffolding only.
7. Present the 3 pairings to the user with their rationales. Ask which to keep.
8. After the user picks: remove all `.font-tasting-label` elements, remove per-group font overrides, remove `<link>` tags for unchosen fonts, apply the chosen pairing's fonts uniformly to the entire page.

### Rules
- Maximum 3 pairings. Never more.
- Each pairing must be a complete system: headline font + body font (+ accent font if relevant).
- Pairings should be genuinely different from each other — not three variations of the same aesthetic.
- In brand register, never include [BR]-tagged fonts in the tasting options.
- The tasting layout is temporary. It must be fully cleaned up after selection.
- If the user rejects all options: ask what they dislike about each (this narrows the next selection), then pick different pairings using the feedback as a filter. If the user names a specific font, apply it directly and exit tasting mode.

## Live-mode signature params

Each variant MUST declare a `scale` param controlling the hierarchy ratio. Express all font sizes in the variant's scoped CSS through `calc(var(--p-scale, 1) * <base>)` or, better, scale the type ramp via `clamp(min, calc(var(--p-scale, 1) * Npx), max)`. Users slide from subdued to commanding.

```json
{"id":"scale","kind":"range","min":0.85,"max":1.3,"step":0.05,"default":1,"label":"Scale"}
```

Where the variant riffs on a specific pairing, expose the pairing choice as a `steps` param (e.g. "serif display + sans body" vs. "mono display + sans body" vs. "all-sans"). Each branch routes through `:scope[data-p-pairing="X"]` selectors in scoped CSS.

See `reference/live.md` for the full params contract.

