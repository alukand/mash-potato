# Product register

When design SERVES the product: app UIs, admin dashboards, settings panels, data tables, tools, authenticated surfaces, anything where the user is in a task.

## The product slop test

Not "would someone say AI made this." Familiarity is often a feature here. The test is: would a user fluent in the category's best tools (Linear, Figma, Notion, Raycast, Stripe come to mind) sit down and trust this interface, or pause at every subtly-off component?

Product UI's failure mode isn't flatness, it's strangeness without purpose: over-decorated buttons, mismatched form controls, gratuitous motion, display fonts where labels should be, invented affordances for standard tasks. The bar is earned familiarity. The tool should disappear into the task.

**Identity clause.** Earned familiarity constrains *component vocabulary* (standard controls, predictable navigation, known form patterns), not *identity*. A product surface still owes the project a recognizable voice: color temperature, type personality, signature moments. "Looks like Linear" is a floor for trust, not a ceiling for character — reading this section as "make it look like the category's best tools" is how every product ends up beige.

## Audience scene (audience fit, product expression)

The product-register expression of SKILL.md § Audience fit. The brief's audience is a design input on par with register, not background trivia. Before designing any surface, write one concrete scene: **who** is using it, **doing what**, **how often**, and **what confusion costs them**. "A volunteer entering thirty visitor cards on Monday morning, interrupted twice" and "the same volunteer scanning the directory for one phone number" are the same demographic and opposite designs — the first earns big targets and one obvious path, the second earns density. The scene decides per surface.

**Demographic-to-style mappings are banned as rules** ("non-technical = bigger fonts", "older users = fewer features"). They feel safe and produce sameness, and the scene regularly contradicts them. Derive every choice from the scene; record the reasoning ("interruption-prone data entry → oversized submit, sticky progress") so the choice survives review.

**If the scene cannot be written from the brief** — audience, comfort level, context, or frequency unknown — ask the user 2-3 questions and wait. Never assume a demographic or invent one from the product category.

**Confidence test (close gate on new or redesigned surfaces):** could this audience's least-confident user complete the surface's primary action without any helper text? If the design only works annotated, it failed structurally — restructure it, don't explain it.

**Bans (failure modes, not outcomes):**

- Compensating for unclear structure with sprinkled micro-descriptors, tooltips, and helper text.
- Burying or shrinking the primary action to look clean.
- Density as a default without a scanning job that earns it; airiness as a default without a guidance job that earns it.

## Typography

- **System fonts are legitimate.** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` gives you native feel on every platform. Inter is the common cross-platform default for a reason.
- **One family is often right.** Product UIs don't need display/body pairing. A well-tuned sans carries headings, buttons, labels, body, data.
- **Fixed rem scale, not fluid.** Clamp-sized headings don't serve product UI. Users view at consistent DPI, and a fluid h1 that shrinks in a sidebar looks worse, not better.
- **Tighter scale ratio.** 1.125–1.2 between steps is typical. More type elements here than on brand surfaces; exaggerated contrast creates noise.
- **Line length still applies for prose** (65–75ch). Data and compact UI can run denser; tables at 120ch+ are fine.

## Color

Product defaults to Restrained. A single surface can earn Committed (a dashboard where one category color carries a report, an onboarding flow with a drenched welcome screen), but Restrained is the floor.

- State-rich semantic vocabulary: hover, focus, active, disabled, selected, loading, error, warning, success, info. Standardize these.
- Accent color used for primary actions, current selection, and state indicators only, not decoration.
- A second neutral layer for sidebars, toolbars, and panels (slightly cooler or warmer than the content surface).

## Layout

- Predictable grids. Consistency IS an affordance; users navigate faster when the structure is expected.
- Familiar patterns are features. Standard navigation (top bar, side nav), breadcrumbs, tabs, and form layouts have established user expectations. Don't reinvent for flavor.
- Responsive behavior is structural (collapse sidebar, responsive table, breakpoint-driven columns), not fluid typography.
- In high-density product surfaces (data tables, dashboards, monitoring, admin panels), card containers become visual clutter. Group with `border-t`, `divide-y`, or negative space instead. Cards earn their place only when elevation communicates hierarchy or when content is truly distinct and independently actionable.

## Components

Every interactive component has: default, hover, focus, active, disabled, loading, error. Don't ship with half of these.

- Skeleton states for loading, not spinners in the middle of content.
- Empty states that teach the interface, not "nothing here."
- Consistent affordances across the surface. Same button shape. Same form-control vocabulary. Same icon style.
- **No separator characters between a label and its count** (owner rule 2026-07-04, AgencyOS competitor scoreboard): in tabs, segmented options, buttons, and titles, a count is a quieter number after the label — smaller size, muted color, space only ("They win 14" with the 14 muted; AgencyOS recipe: label + `ml-2` muted span, see CrmPageHeader.tsx). Never "Label · 14", "Label - 14", or "Label (14)" in controls.
- **Middle-dot separators are banned everywhere** (owner extension 2026-07-04, AgencyOS ads IA mock round — supersedes the earlier metadata-prose exception): no "·" anywhere in UI text, including metadata sublines, chips, and group labels. Separate with commas, plain spacing with a type/color shift, or vertical dividers (`w-px` element) — and never an em dash as the substitute.
- **Adjacent controls in one row share one height** (owner rule 2026-07-04): a 34px chip next to a 40px button in the same control row reads broken. Size icon buttons, dropdown triggers, and status controls to their tallest sibling; counts on icon buttons ride as a corner badge, not inline text.
- **Segmented controls are a mode switch, not a default filter** (owner correction 2026-07-04, AgencyOS scoreboard round: "we overuse this slider thing a lot"): when one small dataset could render whole, a segmented filter over it is navigation debt — render everything as grouped sections with quiet uppercase headers + counts (zero view state, groups comparable at a glance), and delete any per-row status column the grouping makes redundant. Reserve segmented controls for genuine view/mode switches (calendar vs list, different data shapes) or when each group is individually too large to show together. Before reaching for a segmented control, ask: could sections show it all?
- **Controls overlaid on imagery are SOLID** (owner correction 2026-07-06, AgencyOS article editor: translucent Change/Remove hover buttons vanished over busy and dark photos): any button or control rendered on top of a photo or arbitrary user imagery takes an opaque fill — panel-white with a visible border for neutral actions, a solid semantic fill for destructive ones — plus a lift shadow. Never a translucent wash or backdrop-blur tint whose contrast depends on the pixels beneath it; a dimming scrim on the image helps but never substitutes for opaque controls.
- **A panel whose children paint to its edge takes a real border, never an inset ring** (owner-confirmed root cause 2026-07-06, AgencyOS listings chassis: "still really hard to see the left side of the panel" through three rounds of edge-darkening): an inset ring is a box-shadow drawn on the parent's own layer, and any child with an opaque background (a tinted rail column, a full-bleed header/footer band, an image filling a thumbnail frame) paints ON TOP of it — the edge silently disappears only on the covered sides, which reads as a mysterious contrast problem and invites futile opacity bumps. A CSS `border` participates in layout, so children sit inside it and can never cover it. Inset rings stay safe only on leaf elements that own their background (chips, inputs, badges) or containers whose perimeter stays exposed (transparent children, padded content). Outward rings (non-inset) are also safe — they draw outside the element. Diagnostic tell: an edge that vanishes on exactly the sides where a tinted column or band touches it.

### Shape vocabulary (consistency is per MEANING, not one shape for everything)

The clause above is the most misread rule in this register: "consistent vocabulary" means one form per meaning — it does not mean one form for every meaning. When a single shape (usually the fully-rounded pill) colonizes a page — status badges, filter chips, toggles, and inputs all rendered as the same soft capsule in the same quiet fill — roles stop being distinguishable at a glance and the page reads as template output. That sameness is the "basic, safe, boring" tell users feel but can't name.

- Assign shapes to meanings and hold the line: identity/status = fully rounded (status pills, avatars, count bubbles); interactive choices (multi-select chips, toggles) = control radius (10–12px) in the enabled-field language with the app's selected-state vocabulary; enterable fields = the field recipe; exclusive options = the segmented control. Same meaning, same form, everywhere; different meaning, never the same form.
- `rounded-full` on an interactive rectangle is a decision, not a default. An interactive choice is not a status.
- Field, chip, and control recipes are PRIMITIVES — one exported source imported everywhere, never per-file class constants. Duplicated recipes are how one corrected surface leaves ten stale ones behind it.

### Fields read enabled (universal default; owner corrected this on TWO projects before it landed here)

Enterable fields take the SURFACE fill (panel/sheet white or its dark equivalent) with a clearly visible border (`ink/[0.14–0.16]` class) and a soft shadow — never a tone-on-tone gray/well fill. A well-filled input on a light surface reads washed or disabled; users feel it instantly even when they can't name it. Well/inset fills are reserved for read-only insets and disabled states. When the form column is itself white, faintly tint the COLUMN (a few points below the page tone) so white fields stay crisp against it — tint the surface, never gray the field. Dropdown triggers and combo-box fields follow the same recipe as inputs. (Owner corrections: ChurchOS 2026-07-02 "fields read enabled"; AgencyOS studio brief + brand kit + campaign builder 2026-07-04 "use those fields as a default... I've had to correct you multiple times." The lesson stayed project-local the first time and the same defect shipped again on the second project — which is exactly what this section exists to prevent.)

### Visual choosers show outcomes (no blind pickers)

Any control whose options change a **visual outcome** — template, layout, aspect ratio/format, theme, platform frame — renders each option as a preview of what it produces, not a text label. Template pickers render each template as a mini-preview at card size using the project's real content; format pickers show labeled proportional shapes ("Square · feed · 1:1"), not bare ratios; platform toggles visibly swap the preview frame (a Meta post vs a Google search result). A text-only tile for a visual choice is a blind picker: the user cannot know what "Bold offer" or "9:16" looks like without committing, which fails the confidence test. (Owner correction 2026-07-04, AgencyOS creatives studio — second occurrence of the category after the AgencyOS icon-tiles-in-rails rule; previews at card size, never micro-thumbnails.)

## View state persists (default, not a feature)

Users bounce between tabs and pages constantly; navigating away unmounts the view, and coming back must land them exactly where they left off. Any view state a user sets — active tab, open side panel, open record/conversation, filters, search query, sort, calendar view, panel widths — persists across navigation and reload by default (localStorage or equivalent). Plain `useState` for these is a bug even when nobody asked for persistence: build it in on every NEW page or tab from the first version. Ephemeral is the exception and needs a reason (unsaved form drafts have their own draft mechanics; error banners and in-flight flags reset on purpose). If the project has a persisted-state helper (e.g. AgencyOS `usePersistedState` + `crm:<surface>:<setting>:<clientId>` keys), use it instead of re-rolling storage code.

## Flow continuity (journey check, part of every product close)

Walk the click paths, not just the pixels. Pixel gates (alignment, tokens, detect) all pass while the journey is broken; this check catches what they can't:

- Every link either goes DOWN into a detail (and the destination carries a visible way back) or stays on the page as an inline panel/disclosure. A page reachable from app chrome with no back affordance is a defect.
- **Right-size the container** (SKILL.md § Wrong-size container): quick creates and page-owned management open as a drawer or modal over the page (URL-param driven so back closes them); full pages only for destinations with their own identity. A three-field form on its own page is as wrong as a data table in a modal.
- Managing things that belong to a page (saved filters, views, columns, settings-of-this-surface) happens INLINE on that page — URL-param panels, disclosures — never on a detour page the user must find their way back from.
- Marks must encode something (state, identity, area, hierarchy). A dot, icon, or color that merely decorates is removed, not restyled.
- Nesting must be drawn: children of a disclosure indent past its chevron. A hierarchy the eye can't see is not a hierarchy.

Run the walk on every improve/redesign close for product surfaces: list the page's links, name each destination's way back, and check every mark for its meaning.

## Motion

- 150–250 ms on most transitions. Users are in flow; don't make them wait for choreography.
- Motion conveys state, not decoration. State change, feedback, loading, reveal: nothing else.
- **State motion ships in v1.** Container entrances (modal, drawer, popover, disclosure, toast) are part of the component's definition of done — they convey "something opened over your context." The animate pass adds polish choreography; it is never the reason an overlay pops in static.
- No orchestrated page-load sequences. Product loads into a task; users don't want to watch it load.

## Product bans (on top of the shared absolute bans)

- Decorative motion that doesn't convey state.
- Inconsistent component vocabulary across screens. If the "save" button looks different in two places, one is wrong.
- Display fonts in UI labels, buttons, data.
- Reinventing standard affordances for flavor (custom scrollbars, weird form controls, non-standard modals).
- Heavy color or full-saturation accents on inactive states.
- Low-opacity accent washes (accent at ~5-15% fill) as quiet or selected treatments on LIGHT surfaces — they render as washed-out pastel (owner-rejected, 2026-07-05: "that weird blue color"). Quiet elements take neutral ink tints; selected states are crisp: an accent ring on a white card, or solid accent with white text. Accent glow shadows on selection states read as haze in light mode — cut them.
- Identical metric card grids on dashboards. Use grouped inline metrics with dividers or `border-top` separation instead.

## Product permissions

Product can afford things brand surfaces can't.

- System fonts and familiar sans defaults (Inter, SF Pro, system-ui stacks).
- Standard navigation patterns: top bar + side nav, breadcrumbs, tabs, command palettes.
- Density. Tables with many rows, panels with many labels, dense information when users need it.
- Consistency over surprise. The same visual vocabulary screen to screen is a virtue; delight is saved for moments, not pages.

