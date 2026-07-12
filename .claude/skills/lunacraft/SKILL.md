---
name: lunacraft
description: LunaCraft designs, critiques, polishes, animates, and hardens frontend interfaces. Use when the user wants to design, redesign, improve, audit, polish, elevate, or animate websites, landing pages, dashboards, app shells, product UI, forms, onboarding, or frontend sections — including motion passes (scroll reveals, load-in, hovers, idle, micro-rewards). Covers visual direction, UX, accessibility, responsive, typography, color, and design systems. Not for backend-only tasks.
version: 0.2.0
license: Apache 2.0. Forked from Impeccable, based on Anthropic's frontend-design skill. See NOTICE.md for attribution.
---

LunaCraft designs and iterates production-grade frontend interfaces. Real working code, committed design choices, exceptional craft.

This is a personal global fork of Impeccable. Treat it as the user's editable design library and preferred replacement for DevGate/web-section-design doctrine unless a project rule says otherwise.

## Browser verification default: OFF

Do **not** open a browser, launch a preview, or take screenshots unless the user explicitly asks for it in their prompt (e.g. "screenshot it", "verify in the browser", "show me how it looks"). Default verification is code-level: read the changed code, run the detect script where required, grep for the change, and run build/lint checks. Skip Visual Evidence and browser-verify steps in all passes unless explicitly requested — note "browser verify: skipped (not requested)" in any close-out that has such a field. Visual reconcile still applies **if** a browser or screenshot was actually used in the session.

**Exception — standalone visual mockups (owner-approved 2026-07-03):** when the deliverable itself is a design comp the user will judge by looking at it (direction concepts, standalone HTML mockups, pitch pages), a local render + screenshot self-critique loop is REQUIRED before delivery — **at two viewport widths minimum** (wide desktop + laptop; one-width checks shipped clipped controls, 2026-07-04): render it, look at it, fix what the screenshot reveals (broken images, fallback fonts, washed-out heroes, dead whitespace, clipping, charset mojibake), re-check. A picture is worth 1000 tokens. Full comp protocol: [reference/mockup.md](reference/mockup.md). This verifies the deliverable, not the running app; it does not extend to normal UI edits inside a project.

## Ownership Boundaries

- Full project initialization, project briefs, technical context, and legacy PRODUCT.md migration belong to `project-context`.
- Marketing/page copy belongs to `copy`: homepage copy, landing page copy, pricing/about/feature page copy, hero copy, CTA copy, rewrites, proofreading, and copy sweeps.
- LunaCraft owns UI design, visual systems, frontend implementation, `DESIGN.md`, and interface microcopy inside UI flows.
- For shared copy quality standards, use [reference/copy-doctrine.md](reference/copy-doctrine.md). LunaCraft applies it to UI microcopy and design critique; the `copy` skill applies it to page and marketing copy.

### Page build SEO gate (fail-closed)

When building or revising a **full page** (new route, new `index.astro`, or user pasted page copy):

0. **Page type detect** — read `~/.claude/skills/copy/references/seo-page-types.md` (tie-break: map `notes` wins).
1. **Keyword adequacy gate (new pages only)** — read `~/.claude/skills/copy/references/seo-page-build.md` § Step 1. If `SEO-KEYWORDS.md` has too few keywords for the page type, **stop and ask the user** before creating files. Do not silently build.
2. If the user supplied **Meta Title**, **Meta Description**, or **H1**, read `~/.claude/skills/copy/references/seo-copy.md` § **Supplied Copy Intake** first.
3. **Copy input (new pages)** — enrich supplied paste **or** generate copy per seo-page-build.md § Step 2 B so v1 targets map keywords.
4. **Layer B pre-build plan** — link plan table per seo-page-build.md § Step 2.5 (required destinations + contextual vs CTA); schema note; local proof slots; SAP #2+ doorway/uniqueness per seo-page-types.md.
5. Update **`SEO-KEYWORDS.md`** and canonical meta in code (`src/lib/page-seo.ts` on Momentum) **before** hero/section components.
6. Page `index.astro` must import meta via `getPageSeo('/path/')` (or project equivalent), not inline guessed strings.
7. **Not done** until map `title`/`meta` match `page-seo.ts` exactly (grep evidence), keyword grep verify passes, and Layer B spot-check noted (required link destinations + contextual links — CTAs do not satisfy contextual minimum).
8. **After ship (SAP):** recommend copy skill **Off-site SEO Audit** ([seo-off-site-audit.md](../../copy/references/seo-off-site-audit.md)) — not blocking build.

Section-only UI (one band, spacing, color) skips this gate unless title/meta/H1 are in scope.

**Post-design closeout (existing pages):** Run the `copy` skill **SEO Page Audit** ([seo-page-audit.md](../../copy/references/seo-page-audit.md)) — Layers A/B/C on-site. Layer D off-site audit is separate when user asks.

## Setup

Before any design work or file edits:

1. Load context files (project brief / DESIGN.md / TECHNICAL.md) via the loader script.
2. Identify the register and load the matching register reference (brand.md or product.md).
3. **If the user invoked a sub-command (e.g. `craft`, `animate`, `polish`, `audit`), load its reference file too.** This is non-negotiable: `craft` without `craft.md` loaded means you'll skip the shape-and-confirm step; **`animate` without [reference/animate.md](reference/animate.md) loaded means you'll skip the mandatory 6-layer checklist and close-out block.**

Skipping these produces generic output that ignores the project.

### 1. Context gathering

Three context files, case-insensitive. The loader looks at the project root by default and falls back to `.agents/context/` and `docs/` if the root is clean. Override with `LUNACRAFT_CONTEXT_DIR=path/to/dir` (absolute or relative to cwd). Legacy `IMPECCABLE_CONTEXT_DIR` is also accepted.

- **PROJECT-BRIEF.md** or `*-project-brief.md`: required. Users, brand, tone, business rules, anti-references, strategic principles. Legacy `PRODUCT.md` is readable but not the new-project default.
- **DESIGN.md**: optional, strongly recommended. Colors, typography, elevation, components.
- **TECHNICAL.md** or `*-technical.md`: optional, strongly recommended for implementation. Stack, architecture, integrations, commands, deployment, testing, constraints, known gotchas. This informs feasibility and code choices; it does not override visual strategy.

Load context in one call:

```bash
node $HOME/.claude/skills/lunacraft/scripts/load-context.mjs
```

Consume the full JSON output. Never pipe through `head`, `tail`, `grep`, or `jq`. The output's `contextDir` field tells you where the files were resolved from.

If the output is already in this session's conversation history, don't re-run. Exceptions requiring a fresh load: you just ran `/lunacraft teach`, `/lunacraft document`, or project context initialization (they rewrite the files), or the user manually edited one.

`/lunacraft live` already warms context via `live.mjs`. If you've run `live.mjs`, don't also run `load-context.mjs` this session.

If the project brief is missing, empty, or placeholder (`[TODO]` markers, <200 chars): use `project-context` for full project initialization. Use `/lunacraft teach` only as a lightweight repair path when LunaCraft is blocked by missing strategic design context and full initialization is not requested.

If DESIGN.md is missing: nudge once per session (*"Run `/lunacraft document` for more on-brand output"*), then proceed.

**Donor provenance:** if DESIGN.md describes its own system as adapted, transplanted, or carried over from another project ("adapted from X", "carried over as-is", "conventions carry over wholesale"), treat it as provisional identity, not brand truth. Nudge once per session before any iterate pass: *"DESIGN.md still codifies the donor's system — stay inside it, or run `redesign` for a direction of its own?"* Do not let iterate passes silently entrench a donor look the user may be trying to escape.

### 1.5 Token discovery

Before UI design or implementation, discover existing tokens and patterns in this order, stopping when sufficient:

1. Project rules or docs with `design`, `token`, or visual-system guidance.
2. `DESIGN.md` or project-named design context files.
3. `tailwind.config.js` / `tailwind.config.ts` custom colors, fonts, spacing, shadows, and breakpoints.
4. Existing section, layout, and component files that establish local UI patterns.

Do not invent a new token system until the existing one has been checked.

### 2. Register

Every design task is **brand** (marketing, landing, campaign, long-form content, portfolio: design IS the product) or **product** (app UI, admin, dashboard, tool: design SERVES the product).

Identify before designing. Priority: (1) cue in the task itself ("landing page" vs "dashboard"); (2) the surface in focus (the page, file, or route being worked on); (3) `register` field in the project brief. First match wins.

If the project brief lacks the `register` field, infer it once from its "Users" and "Product Purpose" sections, then cache the inferred value for the session. Suggest the user run `/lunacraft teach` or the project context initializer to add the field explicitly.

Load the matching reference: [reference/brand.md](reference/brand.md) or [reference/product.md](reference/product.md). The shared design laws below apply to both.

## Shared design laws

Apply to every design, both registers. Match implementation complexity to the aesthetic vision: maximalism needs elaborate code, minimalism needs precision. Interpret creatively. Vary across projects; never converge on the same choices. the model is capable of extraordinary work. Don't hold back.

### Audience fit (first law — function and look both answer to it)

Before palette or layout, write one concrete line: who this is for and **how they decide or work**. Let that line force both function (structure, information order, density, interaction model) and look (tone, pace, type voice). A contractor pricing a dumpster wants the number, the proof, and the phone number in the first screen; a couple choosing a wedding venue wants atmosphere before facts; a volunteer church admin wants one obvious next step. Same craft, opposite pages.

- Register expressions of this law: [product.md](reference/product.md) § Audience scene (the user's job on this surface + the confidence test); [brand.md](reference/brand.md) § Decision-style scene (how the demographic evaluates and what earns the action).
- **Demographic-to-style lookup tables are banned as rules** ("non-technical = bigger fonts", "contractors = bold industrial", "older = fewer features"). Derive every choice from the written scene and record the reasoning; the scene regularly contradicts the stereotype.
- If the audience or how they decide cannot be written from the brief, **ask 2-3 questions and wait**. Never invent a demographic from the product category.
- Composition inherited from a template, a donor codebase, or a database schema does not count as audience fit. If the layout serves the data model or the template instead of the reader, recompose it — restyling it is not a fix.

### Color

- Use OKLCH. Reduce chroma as lightness approaches 0 or 100; high chroma at extremes looks garish.
- Never use `#000` or `#fff`. Tint every neutral toward the brand hue (chroma 0.005–0.01 is enough).
- Pick a **color strategy** before picking colors. Four steps on the commitment axis:
  - **Restrained**: tinted neutrals + one accent ≤10%. Product default; brand minimalism.
  - **Committed**: one saturated color carries 30–60% of the surface. Brand default for identity-driven pages.
  - **Full palette**: 3–4 named roles, each used deliberately. Brand campaigns; product data viz.
  - **Drenched**: the surface IS the color. Brand heroes, campaign pages.
- The "one accent ≤10%" rule is Restrained only. Committed / Full palette / Drenched exceed it on purpose. Don't collapse every design to Restrained by reflex.

### Theme

Dark vs. light is never a default. Not dark "because tools look cool dark." Not light "to be safe."

Before choosing, write one sentence of physical scene: who uses this, where, under what ambient light, in what mood. If the sentence doesn't force the answer, it's not concrete enough. Add detail until it does.

"Observability dashboard" does not force an answer. "SRE glancing at incident severity on a 27-inch monitor at 2am in a dim room" does. Run the sentence, not the category.

### Typography

- Cap body line length at 65–75ch.
- Hierarchy through scale + weight contrast (≥1.25 ratio between steps). Avoid flat scales.
- Headline size is bound by word count. If it wraps past 3 lines on desktop, it's too big. Fewer words go bigger; more words come down.

### Layout

- Vary spacing for rhythm. Same padding everywhere is monotony.
- Cards are the lazy answer. Use them only when they're truly the best affordance. Nested cards are always wrong.
- Don't wrap everything in a container. Most things don't need one.
- Borders are a last-resort separation technique, not the default. Prefer background tint differentiation (`bg-white/5` on dark surfaces), spacing, or shadow. Borders earn their place only in crisp-edge contexts: pricing tables, form fields, explicit interactive containers. When borders ARE used, derive the color from the existing palette at very low opacity (`border-white/5`, `border-orange-900/20`). Never drop `border-white/20`, pure gray, or a random accent color onto a themed surface. If the border is visible enough to be the first thing you notice, it's too strong.
- Use `min-h-[100dvh]` instead of `h-screen` for full-viewport sections. `h-screen` causes layout jumping on iOS Safari; `dvh` accounts for the dynamic toolbar.
- Never hack Flex into Grid's job with `w-[calc(33%-1rem)]` percentage math. Use CSS Grid for multi-column layouts.

### Motion

- Don't animate CSS layout properties.
- Ease out with exponential curves (ease-out-quart / quint / expo). No bounce, no elastic.

### Absolute bans

Match-and-refuse. If you're about to write any of these, rewrite the element with different structure.

- **Side-stripe borders.** `border-left` or `border-right` greater than 1px as a colored accent on cards, list items, callouts, or alerts. Never intentional. Rewrite with full borders, background tints, leading numbers/icons, or nothing. Owner-confirmed as "AI slop" 2026-07-05 — applies inside document canvases too (CTA blocks, callouts in article editors), and at mock stage, not just shipped UI.
- **Gradient text.** `background-clip: text` combined with a gradient background. Decorative, never meaningful. Use a single solid color. Emphasis via weight or size.
- **Glassmorphism as default.** Blurs and glass cards used decoratively. Rare and purposeful, or nothing.
- **The hero-metric template.** Big number, small label, supporting stats, gradient accent. SaaS cliché.
- **Identical card grids.** Same-sized cards with icon + heading + text, repeated endlessly.
- **Phantom numbering.** Leading digits (`01.`, `Step 1`, `1 —`) on items that aren't actually sequenced, ranked, or counted. Categories, features, values, and other peer lists don't gain meaning from numbers; the digits are scaffolding that fakes editorial structure. Number a list only when reading order carries information (steps in a flow, rank toward a total, addressable IDs the reader cites back). Otherwise: leading icons, eyebrow labels, a kicker word, or nothing.
- **Row-highlight hover.** A faint background tint or highlight box painted over an entire list row, nav item, table row, or link block on hover (`hover:bg-white/5`, `:hover { background: color-mix(... 3–8%) }`, light gray wash on rows). The washed rectangle is the default-affordance reflex and instantly reads as template UI. Hover feedback belongs on the row's own elements: the leading mark or number shifts to the accent color, the title or text brightens, a trailing arrow/chevron slides, an underline grows, an icon fills. Components with a **resting** fill (buttons, filled cards/panels) may deepen or shift their existing fill on hover; bare rows and nav items never gain a background they didn't have at rest.
- **Wrong-size container.** Two mirrored failures, equally lazy. *Modal as first thought:* a modal for something an inline disclosure or popover can do. *Page as first thought:* a full-page navigation for a task that belongs to the current page — a quick create, editing a page's own saved views, a form that fills a third of the screen. Fit the container to the task's weight: popover/disclosure < drawer or modal < full page; pages are reserved for destinations with their own identity and always carry a way back. And **every container that opens moves**: drawers slide, modals settle, popovers pop-fade (150–250ms, transform + opacity, reduced-motion safe). An overlay that appears with no entrance motion is unfinished, not minimal — state motion is part of the component's definition of done, never deferred to a later animate pass.
- **Component nesting 3+ levels deep.** Cards inside cards inside sections, box prisons. Flatten the hierarchy; use spacing, dividers, or background tints to separate content.
- **Meta-label numbering.** Numbered section labels: `SECTION 01`, `QUESTION 05`, `FEATURE 03`. These are scaffolding, not design. Use meaningful eyebrow text or nothing.
- **Equal-weight footer.** Every element (logo, links, contact, hours, legal) at the same type size and spacing. Footers have a hierarchy: the primary tier is loudest, navigation is mid-weight, legal is quietest. If you squint and everything blurs to the same gray, the hierarchy is missing.
- **Primary element buried in footer.** Every footer has a loudest tier — contact info for local businesses, navigation groups for products, brand CTA for marketing pages. If that tier is visually indistinguishable from the legal bar at the bottom, the hierarchy is broken.

### Copy

- Every word earns its place. No restated headings, no intros that repeat the title.
- **No em dashes.** Use commas, colons, semicolons, periods, or parentheses. Also not `--`.

### The AI slop test

If someone could look at this interface and say "AI made that" without doubt, it's failed. Cross-register failures are the absolute bans above. Register-specific failures live in each reference.

**Category-reflex check.** Run at two altitudes; the second one catches what the first one misses.

- **First-order:** if someone could guess the theme + palette from the category alone ("observability → dark blue", "healthcare → white + teal", "finance → navy + gold", "crypto → neon on black"), it's the first training-data reflex. Rework the scene sentence and color strategy until the answer isn't obvious from the domain.
- **Second-order:** if someone could guess the aesthetic family from category-plus-anti-references ("AI workflow tool that's not SaaS-cream → editorial-typographic", "fintech that's not navy-and-gold → terminal-native dark mode"), it's the trap one tier deeper. The first reflex was avoided; the second wasn't. Rework until both answers are not obvious. The brand register's [reflex-reject aesthetic lanes](reference/brand.md) list catches the currently-saturated families.

**Specific AI slop tells** (the detect engine catches most of these mechanically; refuse them at design time, not just at scan time):

- **AI purple/blue gradient aesthetic.** Neon purple glows, purple-to-blue gradients, electric violet accents on dark backgrounds. The single most recognizable AI generation tell. If the palette includes purple-to-blue, it needs a register reason that demands it, not a vibe.
- **Cream/beige default background.** The warm off-white "AI beige" band as an unconsidered default surface. Cream is legitimate only as a scene-driven choice (and project rules may lock it in for specific surfaces); as a reflex it is the highest-frequency generation tell measured in 2026.
- **Italic-serif display hero.** Oversized italic serif (Fraunces, Recoleta, Playfair, Newsreader, Cormorant) as the primary hero H1 — the universal AI-startup hero of 2025-26. Set roman or use a non-serif display face; editorial/magazine registers may earn the pattern deliberately.
- **Hero eyebrow chip.** A tiny uppercase letter-spaced label (especially a pill chip) sitting directly above an oversized hero H1 — the default AI SaaS hero shape. Drop it, fold the kicker into the headline, or move it to breadcrumb position.
- **Decorative grid-line background.** The two-axis hairline-gradient grid overlay on any empty surface. Canvases, maps, blueprints, and measurement tools earn a grid; everything else gets real structure or a plain surface.
- **Font monoculture and font sprawl.** Inter, Roboto, Geist, Mona Sans, Plus Jakarta Sans, Space Grotesk, Fraunces, Recoleta, Instrument Sans/Serif are the converged AI defaults — pick a face with intent, not the reflex. And never more than 3 font families on a surface.
- **Placeholder names and numbers.** Jane Doe, John Smith, $99.99, Acme Corp, "Lorem ipsum." Use plausible, specific, context-appropriate content. A dumpster company testimonial is from "Sally A., Momentum customer," not "Jane D., Happy Customer."

## Build ambition floor (added 2026-07-03, from KCHomeBuyers failure + Anthropic frontend-design)

Bans prevent slop; they do not create design. Every page-level build or mockup must ALSO clear these positive requirements. A page that avoids every ban and clears none of these is a template, and "template" is a failed deliverable even when every section renders correctly.

- **Signature element, named.** Every page has ONE unique element it will be remembered by — an interactive moment, a motif that recurs across sections, a composition nobody else in the category ships. The close-out names it. If you cannot name it, the page is not done. Spend your boldness there and keep everything around it quiet (before leaving the house, remove one accessory).
- **Two-pass build protocol.** Never go straight from a direction blurb to markup. Pass 1: a compact design plan — 4-6 named palette values, type roles (real faces), a one-sentence layout concept plus ASCII wireframe for the hero and any non-obvious section, and the signature element. Pass 2: self-diff the plan against "what would I produce for ANY brief in this category?" — every part that matches the generic answer gets revised before code, and the revision is stated. Only then build, deriving every color/type decision from the plan.
- **Monotony budget.** No more than 2 consecutive sections sharing the same background treatment + container width + alignment. At least one full-bleed or asymmetric moment per page beyond the hero. Uniform section padding is monotony; vary it. The type scale must hit a true display size (clamp ceiling ≥64px) somewhere, and desktop H2s under 36px read as timid.
- **Calibration: the three AI-default looks.** (1) warm cream near #F4F1EA + high-contrast serif display + terracotta accent; (2) near-black + lone acid-green/vermilion accent; (3) broadsheet hairline rules, zero radius, dense columns. All three are defaults, not choices — they appear regardless of subject. If the brief demands one, fine; otherwise landing in one is an automatic Pass-2 revision, no matter how tasteful the execution.
- **Tried/rejected log.** When a direction or pattern is rejected (by user or by self-critique), append one line to the project's DESIGN.md changelog (or session notes if DESIGN.md doesn't exist yet): what was tried, why it died. Future passes read it and do something new.

### Anchor references are optional, never a blocker

Ask once for 2-3 reference sites the user likes/hates. If they have none — or the industry's design ceiling is low and the goal is to leapfrog it — do NOT block and do NOT default to safe. Self-author the ambition: import taste from OUTSIDE the category (name 2-3 anchors from adjacent worlds — hospitality, editorial, fintech, industrial signage — and say why each fits this audience), then run the two-altitude category-reflex check as usual. A design-poor industry is an opportunity brief: the modal competitor page is the anti-reference.

## Mockups and imagery (added 2026-07-03)

- **Direction comp scope (owner rule, 2026-07-03).** Multi-direction comps are hero + 1-2 additional sections per direction — never the full page. Pick the sections that carry the direction's signature element and best show its range; concentrate full craft there. The full page (or full site template) is built only AFTER the user picks a direction. Full-page × N directions divides attention and produces minimum-viable sections everywhere; that failure mode is why this rule exists.
- **Fidelity floor for direction mockups.** Direction comps ship with real webfonts and real, verified imagery. System-font stacks and SVG-placeholder "imagery" are banned in anything the user will judge visually — a direction cannot be judged in Arial. If the delivery channel blocks external fonts/images (e.g. Artifact CSP), change the channel, not the fidelity.
- **Comp construction + delivery rules** ([reference/mockup.md](reference/mockup.md) § Build/Verify owns the detail): fluid width never fixed-px; comp-local class prefixes (generic names collide across frames in single-file comps); ONE file per arc, superseded comps deleted; two-width screenshot gate; deliver by opening the user's default browser (owner rule 2026-07-06: always, even when an editor preview panel already rendered it), never chat file links, CSP-blocked channels, or editor preview tabs.
- **Imagery verification protocol.** Every image is verified twice before placement: (1) it resolves from the VIEWER's context — hotlink protection and bot challenges (SiteGround sgcaptcha et al.) serve you a 200-ish challenge page while breaking in the user's browser, so test with cold requests; (2) its CONTENT is verified by downloading and viewing it, or by evidence of how the source site uses it. Client-site assets are preferred but only after both checks pass; otherwise verified stock (download + view before referencing — guessed stock IDs 404). Never place an image you have not seen or verified in context.
- **Conversion-pattern override.** Local-service lead-gen pages (home buyers, contractors, dumpster rental) inherit the niche's proven hero architecture by default: full-width photographic hero + lead form/phone in the first viewport. "Avoid category reflex" governs palette, type, and voice — never conversion structure. Fighting the conversion pattern requires an explicit user decision.
- **Verify rendered ink, not computed styles.** "Fixed" claims about visual positioning require measuring the RENDERED result: `Range`/element `getBoundingClientRect` of the glyph or icon vs its container, screenshot when available. Box dimensions + computed line-height passing is NOT verification — a font-fallback glyph can still sit in the corner of a perfectly-sized box (KCHomeBuyers, twice). For icon marks (checks, arrows, chevrons, pins), prefer inline SVG positioned `inset:0;margin:auto` over text glyphs: geometry cannot misrender, fonts can (owner-flagged broken text-glyph chevron ⌄/⌃ in a disclosure control, 2026-07-05 — chevrons are always real SVGs).

## Four-phase design workflow

After the initial build (`craft`), LunaCraft iterates through four phases — each with a distinct job:

1. **Improve** — Corrective. Diagnoses structural and functional problems (color, typography, layout, complexity, copy, responsive, performance, edge cases), presents findings at a checkpoint, then fixes confirmed issues sequentially. Run when something is wrong or weak.
2. **Elevate** — Additive (optional). Assesses bland intensity, sterile personality, and conventional ambition — then adds boldness, delight, and technical ambition. Run when the design is structurally sound but visually safe or forgettable. **Not for motion-only work** — use animate after polish. **Stays inside the design system:** when the project has `DESIGN.md`, tokens, or established component styles, elevate makes the existing language more decisive (hierarchy, proportion, density, copy) instead of inventing new colors, gradients, or effects; if the system genuinely cannot express the direction, name the exact additions and ask first. **Escape-valve trigger test:** when the user's complaint targets the system itself (brand fit, donor sameness, "generic", "redesign"), the system cannot express the direction *by definition* — stop and route to [reference/redesign.md](reference/redesign.md) instead of elevating within it.
3. **Polish** — Design lock. Pixel-perfect QA pass: alignment, spacing, state completeness, design-system compliance, code cleanup. Nothing new gets added — everything that exists gets refined. Locks layout, colors, typography, and spacing before motion.
4. **Animate** — Motion-only (post-polish). Non-destructive pass: entrances, scroll reveals, hover stacks, idle presence, micro-rewards. Does not change layout, resting colors, typography, or spacing.

Run them in order (`improve → polish → [elevate optional] → animate`), skip any phase that doesn't apply, or jump directly to whichever phase fits. **`enhance`** ([reference/enhance.md](reference/enhance.md)) compresses improve + elevate into one pass for speed — use it when the user wants one hit that both fixes and emboldens ("make this better", "improve and elevate", "one pass, make it great"). **Elevate** only after polish on existing sections when structure is sound; never substitute elevate for layout fixes. See [reference/composition-guardrails.md](reference/composition-guardrails.md) for media, grid, weight, and **rail subordination**.

**LunaCraft detect (automatic):** When the user asks to improve, elevate, or enhance (any phrasing — not slash commands), the agent runs [reference/detect.md](reference/detect.md) on changed markup before close. One-time install: `npm install --prefix "$HOME/.claude/skills/lunacraft"`. Users never run detect manually.

**Project design gates (per-project):** If `.lunacraft/design.json` contains `projectGates`, improve/elevate run [reference/project-design-gates.md](reference/project-design-gates.md) on changed files before close — catches existing forbidden borders and blocks new ones. Projects without `projectGates` are unaffected.

**Close gates (improve / elevate / enhance / polish):** Cannot finish while **LunaCraft detect** was skipped on changed markup, or while **Section hierarchy budget** P0s remain (rail louder than main H2, watermark zip in aside, meta strip above title, phantom `01/02/03`, split-headline span blow-up). **Context-drift gate:** if the pass changed or contradicted anything `DESIGN.md` states (tokens, palette values, component patterns, philosophy) — including a user decision made mid-pass ("use these new colors", rejected a documented pattern) — update `DESIGN.md` in the same pass before close (edit the fact + one `## Changelog` line + bump `last-verified`), or run `/lunacraft document` for a full regen. A close-out that leaves DESIGN.md contradicting the shipped UI is not done; note `DESIGN.md: updated | unchanged (no drift)` in the close-out. If browser or screenshot was used in that pass, run **Visual reconcile** — one corrective wave (`typeset` / `distill`), then re-check. **Bolder** applies to the primary column only; on split layouts run **typeset before bolder**. **Magnitude honesty:** every close-out states the requested magnitude — tune (fix within system) / re-voice (push the system harder) / re-direction (new identity) — and what the pass actually delivered. If the user asked for re-direction and the pass stayed in-system, the close says "not done as asked" and points to `redesign`; passing every gate does not make a tune-up a redesign.

## Commands

| Command | Category | Description | Reference |
|---|---|---|---|
| `craft [feature]` | Build | Shape, then build a feature end-to-end | [reference/craft.md](reference/craft.md) |
| `mock [screen]` | Build | Mock-first design: standalone comp → iterate on feedback → approval gate → only then build | [reference/mockup.md](reference/mockup.md) |
| `teach` | Build | Repair missing strategic design context when LunaCraft is blocked | [reference/teach.md](reference/teach.md) |
| `document` | Build | Generate DESIGN.md from existing project code | [reference/document.md](reference/document.md) |
| `extract [target]` | Build | Pull reusable tokens and components into design system | [reference/extract.md](reference/extract.md) |
| `critique [target]` | Evaluate | UX design review with heuristic scoring | [reference/critique.md](reference/critique.md) |
| `audit [target]` | Evaluate | Technical quality checks (a11y, perf, responsive) | [reference/audit.md](reference/audit.md) |
| `improve [target]` | Iterate | Diagnose and fix structural/functional design problems | [reference/improve.md](reference/improve.md) |
| `elevate [target]` | Iterate | Add boldness, personality, and ambition (not motion-only) | [reference/elevate.md](reference/elevate.md) |
| `enhance [target]` | Iterate | One-shot improve **then** elevate: fix, then embolden — single checkpoint only when topology/media is at stake, single close, never opens a browser | [reference/enhance.md](reference/enhance.md) |
| `redesign [target]` | Iterate | Renegotiate the visual identity of an existing surface: direction concepts → user picks → DESIGN.md rewritten first → apply. The only command where DESIGN.md is the subject, not a constraint | [reference/redesign.md](reference/redesign.md) |
| `polish [target]` | Iterate | Design-lock QA pass: alignment, spacing, states, tokens | [reference/polish.md](reference/polish.md) |
| `animate [target]` | Iterate | Post-polish motion pass (non-destructive): entrances, hovers, idle, scroll, micro-rewards | [reference/animate.md](reference/animate.md) |
| `live` | Iterate | Visual variant mode: pick elements in the browser, generate alternatives | [reference/live.md](reference/live.md) |

Plus two management commands: `pin <command>` and `unpin <command>`, detailed below.

### Routing rules

1. **No argument**: render the table above as the user-facing command menu, grouped by category. Ask what they'd like to do.
2. **First word matches a command**: load its reference file and follow its instructions. Everything after the command name is the target.
3. **First word matches a retired command name**: offer two paths:
   - Run the full parent command (`improve` or `elevate`), which will assess broadly and dispatch to the specific reference among others.
   - Or run just the specific reference directly for a focused single pass.
   Use the retired-command mapping below to determine the parent.
4. **Natural-language animate**: if the user asks for LunaCraft animate, an animate pass, scroll reveals, load-in animation, micro-rewards, or motion-only work after polish — load [reference/animate.md](reference/animate.md) and run **Steps 0–4** in that file. Do not improvise a single fade-in.
4.5. **Natural-language enhance**: if the user says "enhance", asks to "improve and elevate", or wants one major pass that both fixes and emboldens — load [reference/enhance.md](reference/enhance.md) (plus improve.md and elevate.md) and run the full flow. This is the user's default for major improvement work; do not substitute a lone improve pass, and never open a browser. **Intent outranks the keyword:** if the same request carries re-direction signals (rejects brand fit, "significant redesign", "looks generic", donor/competitor sameness, "new look"), do not run enhance — route to rule 4.6, or present the enhance-vs-redesign choice in one line when genuinely ambiguous.
4.6. **Natural-language redesign**: if the user asks to redesign, rebrand, or re-skin an existing surface, or rejects the current look at identity level ("doesn't feel like our brand", "still looks like [donor]", "not excited to open it") — load [reference/redesign.md](reference/redesign.md) and run its flow. An in-system enhance can never satisfy this request.
4.7. **Natural-language mock-first**: if the user asks for a mock/mockup/comp of a screen, to "see it before we build," or to think through a design before implementation — load [reference/mockup.md](reference/mockup.md) and run its flow. This is the owner's standing preference for new screens and redesign applies (2026-07-04): the real screen is built only after explicit mock approval. Redesign direction concepts (rule 4.6) also deliver their comps under mockup.md's build + verify rules.
5. **First word doesn't match** (and rules 4-4.6 don't apply): general design invocation. Apply setup, shared design laws, and the loaded register reference.

Setup (context gathering, register) is already loaded by then; sub-commands don't re-invoke `/lunacraft`.

If the first word is `craft`, setup still runs first, but [reference/craft.md](reference/craft.md) owns the rest of the flow. If the first word is `animate`, [reference/animate.md](reference/animate.md) owns the flow — **Steps 0–4 are mandatory; Step 3 close-out is required before finishing.** If setup invokes `teach` as a blocker, finish teach, refresh context, then resume the original command and target.

### Retired-command mapping

These commands are no longer user-facing but their reference files still exist for internal dispatch by `improve` and `elevate`.

| Retired Command | Parent | Internal Reference |
|---|---|---|
| `shape` | (internal to craft) | [reference/shape.md](reference/shape.md) |
| `colorize` | improve | [reference/colorize.md](reference/colorize.md) |
| `typeset` | improve | [reference/typeset.md](reference/typeset.md) |
| `layout` | improve | [reference/layout.md](reference/layout.md) |
| `distill` | improve | [reference/distill.md](reference/distill.md) |
| `clarify` | improve | [reference/clarify.md](reference/clarify.md) |
| `adapt` | improve | [reference/adapt.md](reference/adapt.md) |
| `optimize` | improve | [reference/optimize.md](reference/optimize.md) |
| `quieter` | improve | [reference/quieter.md](reference/quieter.md) |
| `harden` | improve | [reference/harden.md](reference/harden.md) |
| `onboard` | improve | [reference/onboard.md](reference/onboard.md) |
| `bolder` | elevate | [reference/bolder.md](reference/bolder.md) |
| `delight` | elevate | [reference/delight.md](reference/delight.md) |
| `overdrive` | elevate | [reference/overdrive.md](reference/overdrive.md) |

### Supporting references (loaded by commands, not user-facing)

Beyond the command references above, `reference/` holds supporting modules that commands load on demand: `typography.md`, `spatial-design.md`, `fonts.md`, `color-and-contrast.md`, `interaction-design.md`, `motion-design.md`, `responsive-design.md`, `ux-writing.md` (craft Step 2 + improve dispatch), `cognitive-load.md`, `heuristics-scoring.md`, `personas.md` (critique), `codex.md` (craft's image-generation subflow), and `copy-doctrine.md` (shared with the copy skill). They are intentional; do not flag them as orphans or delete them.

## Pin / Unpin

**Pin** creates a standalone shortcut so `/<command>` invokes `/lunacraft <command>` directly. **Unpin** removes it. The script writes to every harness directory present in the project.

```bash
node $HOME/.claude/skills/lunacraft/scripts/pin.mjs <pin|unpin> <command>
```

Valid `<command>` is any command from the table above. Report the script's result concisely. Confirm the new shortcut on success, relay stderr verbatim on error.
