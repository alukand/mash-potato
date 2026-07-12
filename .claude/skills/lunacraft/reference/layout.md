Space is the most underused design tool. Find the layout's actual problem (monotone spacing, weak hierarchy, identical card grids, the centered-stack default) and fix the structure, not the surface.

---

## Register

Brand: asymmetric compositions, fluid spacing with `clamp()`, intentional grid-breaking for emphasis. Rhythm through contrast: tight groupings paired with generous separations.

Product: predictable grids, consistent densities, familiar navigation patterns. Responsive behavior is structural (collapse sidebar, responsive table), not fluid typography. Consistency IS an affordance.

---

## Assess Current Layout

Analyze what's weak about the current spatial design:

1. **Spacing**:
   - Is spacing consistent or arbitrary? (Random padding/margin values)
   - Is all spacing the same? (Equal padding everywhere = no rhythm)
   - Are related elements grouped tightly, with generous space between groups?

2. **Visual hierarchy**:
   - Apply the squint test: blur your (metaphorical) eyes. Can you still identify the most important element, second most important, and clear groupings?
   - Is hierarchy achieved effectively? (Space and weight alone can be enough; is the current approach working?)
   - Does whitespace guide the eye to what matters?

3. **Grid & structure**:
   - Is there a clear underlying structure, or does the layout feel random?
   - Are identical card grids used everywhere? (Icon + heading + text, repeated endlessly)
   - Is everything centered? (Left-aligned with asymmetric layouts feels more designed, but not a hard and fast rule)

4. **Rhythm & variety**:
   - Does the layout have visual rhythm? (Alternating tight/generous spacing)
   - Is every section structured the same way? (Monotonous repetition)
   - Are there intentional moments of surprise or emphasis?

5. **Density**:
   - Is the layout too cramped? (Not enough breathing room)
   - Is the layout too sparse? (Excessive whitespace without purpose)
   - Does density match the content type? (Data-dense UIs need tighter spacing; marketing pages need more air)

**CRITICAL**: Layout problems are often the root cause of interfaces feeling "off" even when colors and fonts are fine. Space is a design material; use it with intention.

## Composition Rethink

If the assessment above reveals the problem is the **structure itself** — not spacing within a working structure, not rhythm between good sections — stop refining. The current composition choice is wrong, and adjusting spacing on a bad structure produces polished bad structure.

**Before choosing a catalog swap:** Load [composition-guardrails.md](composition-guardrails.md). If a **split screen** is balanced and on-brand, tune spacing, rhythm, and column ratio first—do not jump to Bento, Broken Grid, or overlay hero without a checkpoint and user confirm. Catalog patterns that increase text-on-image overlap must cite guardrails escape hatch.

Select an alternative from the Composition Alternatives Catalog below. State your choice and reasoning in one line, then rebuild the section with the new structure. Do not propose multiple options to the user (they already confirmed fixes at the improve checkpoint). Pick the best fit for the content type and register, name it, and proceed.

Example: *"Replacing the 3-column equal card grid with a Feature Showcase layout (one large + multiple small) — better hierarchy for content with a clear primary item."*

### Composition Alternatives Catalog

Named layout patterns to reach for when the current structure isn't working. Each pattern fits specific content types; match the pattern to the content, not to preference.

- **Bento Grid**: Varied card sizes in a dense grid (`grid-template-columns: 2fr 1fr 1fr`). When content has mixed importance levels and you want visual hierarchy without vertical stacking.
- **Masonry**: Pinterest-style staggered columns, items at natural heights. When content items have different lengths and forced equal heights create awkward whitespace.
- **Split Screen**: 50/50 or 60/40 halves with distinct content per side. When two concepts need equal weight, or text and media pair naturally.
- **Sticky Scroll Stack**: Sections pin to viewport and stack as user scrolls. When sections tell a sequential story and each deserves full-viewport attention (brand register).
- **Horizontal Scroll Hijack**: Vertical scroll drives horizontal movement. When content is a linear progression (timeline, process, gallery) and vertical stacking would lose the flow (brand register).
- **Asymmetric Grid**: CSS Grid fractional units creating deliberate imbalance (`2fr 1fr`, `3fr 2fr 1fr`). When equal columns flatten the hierarchy and one content area should dominate.
- **Overlapping / Broken Grid**: Elements escape containers with negative margins for physical depth. When the layout feels too contained and needs dimensional energy (brand register).
- **Full-Bleed Sections**: Edge-to-edge backgrounds with contained content. When sections need strong visual separation and background treatment carries the voice.
- **Diptych / Triptych**: Two or three panel compositions, often with distinct backgrounds per panel. When comparing concepts or showing before/after, or creating editorial rhythm.
- **Timeline / Vertical Progression**: Connected vertical flow with alternating left/right content. When content has chronological or sequential order and the relationship between items matters.
- **Magazine / Editorial**: Mixed column widths, pull quotes, varied image sizes, text wrap. When long-form content needs visual variety without breaking reading flow (brand register).
- **Dashboard Dense**: `border-t` / `divide-y` grouping with no card containers, monospace numbers. When data density is high and cards create visual clutter (product register).
- **Feature Showcase**: One large featured item + multiple smaller items in asymmetric arrangement. When content has a clear primary item and supporting items.
- **Accordion / Progressive Disclosure**: Content revealed on demand, collapsed by default. When there's too much content for the viewport and users need different subsets.
- **Tab-Driven Switching**: Content areas swapped by tab selection. When multiple content categories share the same space and users choose which to view.

For physical depth techniques (overlap, z-axis layering, negative margins, broken grid escapes), load [bolder.md](bolder.md) — Spatial Drama section.

## Cross-Section Rhythm

Applies when the target is a full page or multi-section surface. Skip for isolated single-section fixes.

Sections on a page create a rhythm the same way bars in music do. Same-beat repetition (dark section, dark section, dark section) is monotonous regardless of how good each section is individually.

- Vary at least 2 of these across consecutive sections: **background treatment**, **content density**, **alignment direction**, **scale contrast**.
- If section A is dark and dense, section B should breathe lighter. If section B is left-aligned, section C can center or right-weight.
- A page that uses the same structure for every section has no rhythm regardless of within-section spacing.
- Background alternation alone is not rhythm. Alternating dark/light backgrounds while keeping the same centered-text-over-cards layout is a paint job, not composition.

## Section-Type Guidance: Footer

Footers are the most templated section in AI-generated design. Without specific guidance, every footer defaults to the training-data median: dark rectangle, 3-4 equal columns of links, everything the same size. The fix is hierarchy and pattern awareness.

### Footer Hierarchy Rule

Visual weight descends in tiers. Every footer has three layers, and each must be visually distinct from the others:

1. **Primary tier** (loudest): The footer's main job for this context. Varies by pattern — see below.
2. **Navigation tier** (mid-weight): Organized link groups. Scannable, clearly labeled, quieter than the primary tier.
3. **Legal tier** (quietest): Copyright, terms, privacy policy. Smallest text, lowest contrast, bottom of the footer.

If you squint and all three tiers blur to the same gray, the hierarchy is missing. The primary tier should be immediately identifiable without reading.

### Footer Composition Patterns

Match the pattern to the site type. Don't apply a local business footer to a SaaS product or vice versa.

- **Local Service Footer**: Contact-first. The phone number is the #1 element — large, tappable, visually distinct, styled as a call-to-action (not a data field). Email and physical address support it. Hours as a clean vertical list (day range + time, one line each — never an inline table or cramped grid). Service areas as a scannable 2-3 column cluster, not a spreadsheet. Navigation links are secondary. *Primary tier: contact/action zone.* Use for: local businesses, service companies, restaurants, contractors, medical practices.

- **Brand Footer**: Brand statement or newsletter CTA leads. A short brand description or email signup occupies the primary position. Navigation columns (3-4 groups) sit alongside or below. Social links are present but not dominant. *Primary tier: brand CTA or statement.* Use for: marketing sites, agency pages, editorial publications, product landing pages.

- **Product Footer**: Navigation-first. Sitemap-lite structure with categorized link groups (Product, Company, Resources, Support, Legal). No contact CTA — support lives in-app. Dense but organized, with clear group headings. *Primary tier: navigation groups.* Use for: SaaS products, dashboards, developer tools, documentation sites.

- **Minimal Footer**: Single-tier. Legal links + copyright only. No navigation, no contact, no branding. *Single tier.* Use for: focused landing pages, checkout flows, single-purpose pages where the footer should not compete with the page's action.

### Footer-Specific Rules

- The footer is a visual **close** to the page — the last designed moment, not an information dump. It should feel intentional, not like leftover content crammed into a dark rectangle.
- Hours format: clean vertical list. Each line is a day range + time (`Mon - Fri: 7:00 AM - 6:00 PM`). Never an inline table, never a cramped multi-column grid of days and times.
- Service areas: scannable cluster in 2-3 columns. Group by proximity or alphabetically. Not a spreadsheet of every city in a region.
- Phone numbers on local business footers must be `tel:` linked for mobile tapping. Style them as a CTA, not as body text.
- The footer's background treatment should participate in the page's Cross-Section Rhythm (see above), not default to "dark rectangle" regardless of the page's palette.

For background treatment options for the footer section, see [brand.md](brand.md) Background Modes. For the footer's role in page rhythm, see Cross-Section Rhythm above.

## Plan Layout Improvements

Consult the [spatial design reference](spatial-design.md) for detailed guidance on grids, rhythm, and container queries.

Create a systematic plan:

- **Spacing system**: Use a consistent scale (a framework's built-in scale like Tailwind's, rem-based tokens, or a custom system). The specific values matter less than consistency.
- **Hierarchy strategy**: How will space communicate importance?
- **Layout approach**: What structure fits the content? Flex for 1D, Grid for 2D, named areas for complex page layouts.
- **Rhythm**: Where should spacing be tight vs generous?

## Improve Layout Systematically

### Establish a Spacing System

- Use a consistent spacing scale (framework scales like Tailwind, rem-based tokens, or a custom scale all work). What matters is that values come from a defined set, not arbitrary numbers.
- Name tokens semantically if using custom properties: `--space-xs` through `--space-xl`, not `--spacing-8`
- Use `gap` for sibling spacing instead of margins; eliminates margin collapse hacks
- Apply `clamp()` for fluid spacing that breathes on larger screens

### Create Visual Rhythm

- **Tight grouping** for related elements (8-12px between siblings)
- **Generous separation** between distinct sections (48-96px)
- **Varied spacing** within sections (not every row needs the same gap)
- **Asymmetric compositions**: break the predictable centered-content pattern when it makes sense

### Choose the Right Layout Tool

- **Use Flexbox for 1D layouts**: Rows of items, nav bars, button groups, card contents, most component internals. Flex is simpler and more appropriate for the majority of layout tasks.
- **Use Grid for 2D layouts**: Page-level structure, dashboards, data-dense interfaces, anything where rows AND columns need coordinated control.
- **Don't default to Grid** when Flexbox with `flex-wrap` would be simpler and more flexible.
- Use `repeat(auto-fit, minmax(280px, 1fr))` for responsive grids without breakpoints.
- Use named grid areas (`grid-template-areas`) for complex page layouts; redefine at breakpoints.

### Break Card Grid Monotony

- Don't default to card grids for everything; spacing and alignment create visual grouping naturally
- Use cards only when content is truly distinct and actionable. Never nest cards inside cards
- Vary card sizes, span columns, or mix cards with non-card content to break repetition

### Strengthen Visual Hierarchy

- Use the fewest dimensions needed for clear hierarchy. Space alone can be enough; generous whitespace around an element draws the eye. Some of the most polished designs achieve rhythm with just space and weight. Add color or size contrast only when simpler means aren't sufficient.
- Be aware of reading flow: in LTR languages, the eye naturally scans top-left to bottom-right, but primary action placement depends on context (e.g., bottom-right in dialogs, top in navigation).
- Create clear content groupings through proximity and separation.

### Manage Depth & Elevation

- Create a semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip)
- Build a consistent shadow scale (sm → md → lg → xl); shadows should be subtle
- Use elevation to reinforce hierarchy, not as decoration

### Optical Adjustments

- If an icon looks visually off-center despite being geometrically centered, nudge it. But only if you're confident it actually looks wrong. Don't adjust speculatively.

**NEVER**:
- Use arbitrary spacing values outside your scale
- Make all spacing equal (variety creates hierarchy)
- Wrap everything in cards (not everything needs a container)
- Nest cards inside cards (use spacing and dividers for hierarchy within)
- Use identical card grids everywhere (icon + heading + text, repeated)
- Center everything (left-aligned with asymmetry feels more designed)
- Default to the hero metric layout (big number, small label, stats, gradient) as a template. If showing real user data, a prominent metric can work, but it should display actual data, not decorative numbers.
- Default to CSS Grid when Flexbox would be simpler; use the simplest tool for the job
- Use arbitrary z-index values (999, 9999); build a semantic scale

## Verify Layout Improvements

- **Squint test**: Can you identify primary, secondary, and groupings with blurred vision?
- **Rhythm**: Does the page have a satisfying beat of tight and generous spacing?
- **Hierarchy**: Is the most important content obvious within 2 seconds?
- **Breathing room**: Does the layout feel comfortable, not cramped or wasteful?
- **Consistency**: Is the spacing system applied uniformly?
- **Responsiveness**: Does the layout adapt gracefully across screen sizes?

When the rhythm and hierarchy land, this pass is complete. The calling workflow determines the next step.

## Live-mode signature params

Each variant MUST declare a `density` param. Drive all spacing tokens in the variant's scoped CSS through `calc(var(--p-density, 1) * <base>)`: paddings, gaps, column widths. Users slide from airy to packed and see layout re-breathe with no regeneration.

```json
{"id":"density","kind":"range","min":0.6,"max":1.4,"step":0.05,"default":1,"label":"Density"}
```

For variants whose topology genuinely changes (stacked vs. side-by-side, grid vs. bento), use a `steps` param whose scoped CSS branches via `:scope[data-p-structure="X"]`. One structure param + one density param is a powerful combo; resist adding a third.

```json
{"id":"structure","kind":"steps","default":"grid","label":"Structure","options":[
  {"value":"stacked","label":"Stacked"},
  {"value":"grid","label":"Grid"},
  {"value":"bento","label":"Bento"}
]}
```

See `reference/live.md` for the full params contract.

