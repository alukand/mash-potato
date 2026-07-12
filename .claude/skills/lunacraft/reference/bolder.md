When asked for "bolder," AI defaults to the same tired tricks: cyan/purple gradients, glassmorphism, neon accents on dark backgrounds, gradient text on metrics. These are the opposite of bold. Reject them first, then increase visual impact and personality through stronger hierarchy, committed scale, and decisive type.

Load [composition-guardrails.md](composition-guardrails.md) before amplifying. Spatial drama and overlap techniques must honor the preserve contract.

---

## Register

Brand: "bolder" means distinctive. Extreme scale, unexpected color, typographic risk, committed POV.

Product: "bolder" rarely means theatrics; those undermine trust. It means stronger hierarchy, clearer weight contrast, one sharper accent, more committed density. The amplification is in clarity, not drama.

---

## Assess Current State

Analyze what makes the design feel too safe or boring:

1. **Identify weakness sources**:
   - **Generic choices**: System fonts, basic colors, standard layouts
   - **Timid scale**: Everything is medium-sized with no drama
   - **Low contrast**: Everything has similar visual weight
   - **Static**: No motion, no energy, no life
   - **Predictable**: Standard patterns with no surprises
   - **Flat hierarchy**: Nothing stands out or commands attention

2. **Understand the context**:
   - What's the brand personality? (How far can we push?)
   - What's the purpose? (Marketing can be bolder than financial dashboards)
   - Who's the audience? (What will resonate?)
   - What are the constraints? (Brand guidelines, accessibility, performance)

If any of these are unclear from the codebase, ask the user directly to clarify what you cannot infer.

**CRITICAL**: "Bolder" doesn't mean chaotic or garish. It means distinctive, memorable, and confident. Think intentional drama, not random chaos.

**WARNING - AI SLOP TRAP**: Review ALL the DON'T guidelines from the parent LunaCraft skill (already loaded in this context) before proceeding. Bold means distinctive, not "more effects."

## Scope: primary column only (hard rule)

Before any amplification:

1. Load [composition-guardrails.md](composition-guardrails.md) § **Rail / aside subordination**.
2. Identify the **primary story column** (main content, not `<aside>`, rail, or narrow sidebar card).
3. Apply typography and scale drama **only there** unless the user explicitly requests rail treatment.

**Forbidden by default in `<aside>` / rail / sidebar:**

- `text-5xl` / `text-6xl` / `text-7xl` / arbitrary huge `text-[Nrem]` on zip codes, routes, or labels
- Watermark numerals with `absolute` positioning over card content
- Increasing rail title above the section's main `h2` visual weight
- Numbered step tiles (`01`/`02`/`03`) replacing a simple checklist

If intensity is needed in the rail, limit to **color, border, icon, spacing**—not display type scale.

**Calling workflow:** On split layouts, [elevate.md](elevate.md) runs [typeset.md](typeset.md) **before** this file. Do not undo typeset's weight budget.

## Plan Amplification

Create a strategy to increase impact while maintaining coherence:

- **Focal point**: What should be the hero moment? (Pick ONE, make it amazing)
- **Personality direction**: Maximalist chaos? Elegant drama? Playful energy? Dark moody? Choose a lane.
- **Risk budget**: How experimental can we be? Push boundaries within constraints.
- **Hierarchy amplification**: Make big things BIGGER, small things smaller (increase contrast)

**IMPORTANT**: Bold design must still be usable. Impact without function is just decoration.

## Amplify the Design

Systematically increase impact across these dimensions:

### Typography Amplification (primary column only)

- **Replace generic fonts**: Swap system fonts for distinctive choices (see the parent skill's typography guidelines and [typography.md](typography.md) for inspiration)
- **Scale contrast**: Strong ratio between heading and body in the **main column**—must still fit in 2-3 lines. Do **not** shrink one part of an H2 and explode a `<span>` inside the same line (split-headline anti-pattern).
- **Weight contrast**: One loud role per column; pair heavy headings with lighter body—never bold links + bold stats + bold H2 together
- **Unexpected choices**: Variable fonts, display fonts for headlines, condensed/extended widths, monospace as intentional accent (not as lazy "dev tool" default)
- **Do not** add meta strips (`ZIP · ROUTE`) or decorative geo bands above the section H2

### Color Intensification
- **Increase saturation**: Shift to more vibrant, energetic colors (but not neon)
- **Bold palette**: Introduce unexpected color combinations. Avoid the purple-blue gradient AI slop
- **Dominant color strategy**: Let one bold color own 60% of the design
- **Sharp accents**: High-contrast accent colors that pop
- **Tinted neutrals**: Replace pure grays with tinted grays that harmonize with your palette
- **Rich gradients**: Intentional multi-stop gradients (not generic purple-to-blue)

### Spatial Drama

If the layout structure itself is the problem (not just spacing or scale), run `improve` first — it handles composition rethinking via [layout.md](layout.md). Bolder assumes the structure is sound and amplifies the spatial energy within it.

**NEVER (default):**
- Center-mass display headline on a full-bleed photo (subject must stay recognizable)
- Copy in the center mass of the image when a split or caption zone would work
- Replacing a balanced split layout with overlay hero without explicit user request

**Unless the user explicitly requests** text-on-image or overlay hero, keep copy in a side panel or caption zone per [composition-guardrails.md](composition-guardrails.md).

- **Scale contrast**: Important elements 3-5x body text size. Size always respects content length and section proportions.
- **Generous space**: Use white space dramatically (100-200px gaps, not 20-40px)
- **Asymmetric layouts**: Replace centered, balanced layouts with tension-filled asymmetry

#### Depth Techniques

Physical layering that breaks the flat plane. Each creates the illusion of z-axis depth.

- **Negative Margin Overlap**: Elements with `margin-top: -2rem` to `-6rem` that physically overlap their neighbors. Creates a stacked, physical feel. Use on images overlapping content blocks or cards overlapping hero sections.
- **Z-Axis Card Cascade**: Stacked overlapping cards with incremental `translateY` + increasing shadow depth. Three cards at `translateY(0)`, `translateY(8px)`, `translateY(16px)` with shadow-sm/md/lg. Conveys depth and quantity.
- **Broken Grid Escape**: Hero elements that cross column boundaries. An image that bleeds past its grid cell, a headline that overlaps the section below. `position: relative` + negative margins or CSS Grid `grid-row: span 2`.
- **Background-Foreground Separation**: Content floating over a distinct background plane. The background is its own layer (full-bleed color, image, or pattern) via `absolute` positioning + `z-index`, with foreground content elevated above it. Creates atmospheric depth.
- **Inline Image Typography**: Images embedded within headline text flow. A word replaced by or interrupted by a photo. The signature creative technique for breaking flat hero blocks — the text and image become one composition instead of stacked layers.

### Named Visual Effect Patterns

Specific visual treatments that add texture, depth, or character. Each has a distinct aesthetic; choose to match the register and brand.

- **Text Mask Reveal** (gated): Photo/video window through letterforms (`background-clip: text` with a **photographic or video** `background-image` — not a gradient). Parent LunaCraft skill **bans gradient** `background-clip: text`. Use only when the user confirms and the register is editorial; not a default bold move. Verify subject remains readable.
- **Gooey Morph**: SVG `<feGaussianBlur>` + `<feColorMatrix>` filter chain that creates organic, liquid shape transitions. Elements merge and separate like lava lamp blobs. Use on navigation transitions, loading states, or hover effects.
- **Noise / Grain Texture Overlay**: Fixed `::before` pseudo-element with a grain texture image (`background-size: 200px`, `opacity: 0.03–0.08`). Adds analog depth to flat digital surfaces. Always `pointer-events: none` so it doesn't block interaction.
- **Duotone Treatment**: Two-color image processing via CSS `filter` or SVG `<feColorMatrix>`. Maps an image's tonal range to two brand colors. Creates brand-consistent photography from any source image.
- **Halftone / CRT Effects**: Dot-pattern or scanline overlay for retro-industrial character. Achieve with SVG `<feTurbulence>` + `<feDisplacementMap>`, or a repeating-linear-gradient of thin transparent/tinted lines. Use sparingly; works for music, gaming, editorial — not for fintech or healthcare.

### Motion & Animation
- **Entrance choreography**: Staggered, dramatic page load animations with 50-100ms delays
- **Scroll effects**: Parallax, reveal animations, scroll-triggered sequences
- **Micro-interactions**: Satisfying hover effects, click feedback, state changes
- **Transitions**: Smooth, noticeable transitions using ease-out-quart/quint/expo (not bounce or elastic, which cheapen the effect)

### Composition Boldness
- **Hero moments**: Create clear focal points with dramatic treatment
- **Diagonal flows**: Escape horizontal/vertical rigidity with diagonal arrangements
- **Full-bleed elements**: Use full viewport width/height for impact
- **Unexpected proportions**: Golden ratio? Throw it out. Try 70/30, 80/20 splits

**NEVER**:
- Add effects randomly without purpose (chaos ≠ bold)
- Sacrifice readability for aesthetics (body text must be readable)
- Make everything bold (then nothing is bold; you need contrast)
- Ignore accessibility (bold design must still meet WCAG standards)
- Overwhelm with motion (animation fatigue is real)
- Copy trendy aesthetics blindly (bold means distinctive, not derivative)

## Verify Quality

Ensure amplification maintains usability and coherence:

- **Squint test** + **image subject visible** (see [composition-guardrails.md](composition-guardrails.md))
- **NOT AI slop**: Does this look like every other AI-generated "bold" design? If yes, start over.
- **Still functional**: Can users accomplish tasks without distraction?
- **Coherent**: Does everything feel intentional and unified?
- **Memorable**: Will users remember this experience?
- **Performant**: Do all these effects run smoothly?
- **Accessible**: Does it still meet accessibility standards?

**The test**: If you showed this to someone and said "AI made this bolder," would they believe you immediately? If yes, you've failed. Bold means distinctive, not "more AI effects."

Before finishing, the calling workflow must run **Section hierarchy budget** and (if browser was used) **Visual reconcile** from [composition-guardrails.md](composition-guardrails.md). **Do not complete bolder** while rail hierarchy P0s exist.

When checks pass, this pass is complete. The calling workflow determines the next step.

