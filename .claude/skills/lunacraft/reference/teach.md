# Teach Flow

Repairs missing strategic design context when LunaCraft is blocked. For full project initialization, use the separate `project-context` skill, which owns `PROJECT-BRIEF.md`, `DESIGN.md`, and `TECHNICAL.md` together.

- **PROJECT-BRIEF.md** or `*-project-brief.md` (strategic): root project file for register, target users, product purpose, brand personality, business rules, anti-references, strategic design principles. Answers "who/what/why".
- **DESIGN.md** (visual): root project file for visual theme, color palette, typography, components, layout. Follows the [Google Stitch DESIGN.md format](https://stitch.withgoogle.com/docs/design-md/format/). Answers "how it looks".
- **TECHNICAL.md** or `*-technical.md` (technical): implementation context owned by the separate project-context/process workflow. Stack, architecture, integrations, commands, deployment, testing, constraints, known gotchas. LunaCraft reads this context but does not own backend/process governance.

Every other LunaCraft command reads these files before doing any work.

## Step 1: Load current state

Run the shared loader first so you know what already exists:

```bash
node $HOME/.claude/skills/lunacraft/scripts/load-context.mjs
```

The output tells you whether project brief, DESIGN.md, and TECHNICAL.md already exist. If `migrated: true`, legacy `.impeccable.md` or `.lunacraft.md` was auto-renamed to `PROJECT-BRIEF.md`. Mention this once to the user.

Decision tree:
- **No project brief exists (empty project or no context yet)**: do Steps 2-4 (write PROJECT-BRIEF.md), then decide on DESIGN.md based on whether there's code to analyze. Offer project-context initialization if TECHNICAL.md is also missing.
- **Project brief exists, DESIGN.md missing**: skip to Step 5 and offer to run `/lunacraft document` for DESIGN.md.
- **Project brief exists but has no `## Register` section (legacy)**: add it. Infer a hypothesis from the codebase (see Step 2), confirm with the user, write the field.
- **Project brief and DESIGN.md both exist**: ask the user directly to clarify what you cannot infer. Ask which file to refresh. Skip the one the user doesn't want changed.
- **Just DESIGN.md exists (unusual)**: do Steps 2-4 to produce PROJECT-BRIEF.md.

Never silently overwrite an existing file. Always confirm first.

If teach was invoked as a setup blocker by another command, such as `/lunacraft craft landing page`, pause that command here. Complete teach, re-run the loader, then resume the original command with the freshly loaded context. For craft, resume into shape next; teach creates project context, but it is not a substitute for the task-specific shape interview and confirmed design brief.

## Step 2: Explore the codebase

Before asking questions, thoroughly scan the project to discover what you can:

- **README and docs**: Project purpose, target audience, any stated goals
- **Package.json / config files**: Tech stack, dependencies, existing design libraries
- **Existing components**: Current design patterns, spacing, typography in use
- **Brand assets**: Logos, favicons, color values already defined
- **Design tokens / CSS variables**: Existing color palettes, font stacks, spacing scales
- **Any style guides or brand documentation**

Also form a **register hypothesis** from what you find:

- Brand signals: `/`, `/about`, `/pricing`, `/blog/*`, `/docs/*`, hero sections, big typography, scroll-driven sections, landing-page-shaped content.
- Product signals: `/app/*`, `/dashboard`, `/settings`, `/(auth)`, forms, data tables, side/top nav, app-shell components.

Register is a hypothesis at this point, not a decision; Step 3 confirms it.

Note what you've learned and what remains unclear. This exploration feeds PROJECT-BRIEF.md and DESIGN.md. Technical findings can be summarized for TECHNICAL.md, but project-context owns writing that file.

## Step 3: Ask strategic questions (for PROJECT-BRIEF.md)

ask the user directly to clarify what you cannot infer. Ask only about what you couldn't infer from the codebase.

### Interview mode, not confirmation mode

If the repo is empty or the user's brief is sparse, run a short interview before proposing PROJECT-BRIEF.md. Do **not** turn a one-sentence request into a complete inferred project brief and ask for blanket confirmation.

- Use the harness's structured question tool when one exists. Otherwise, ask directly in chat and stop.
- Ask **2-3 questions per round**, then wait for answers.
- Use inferred answers as hypotheses or options, not as finished facts.
- Complete at least one real user-answer round before drafting PROJECT-BRIEF.md, unless every required answer is directly discoverable from repo docs.
- Round 1 should establish register, users/purpose, and desired outcome.
- Round 2 should establish brand personality or references, anti-references, and accessibility needs.

### Minimum viable interview

Ask enough to complete PROJECT-BRIEF.md. At minimum, cover register confirmation, users and purpose, brand personality, business rules, anti-references, and accessibility needs unless each answer is directly discoverable from repo context. After at least one interview round, you may propose inferred answers, but the user must confirm them before you write the project brief. Never synthesize the project brief from the original task prompt alone.

### Register (ask first; it shapes everything below)

Every design task is either **brand** (marketing, landing, campaign, long-form content, portfolio: design IS the product) or **product** (app UI, admin, dashboards, tools: design SERVES the product).

If Step 2 produced a clear hypothesis, lead with it: *"From the codebase, this looks like a [brand / product] surface. Does that match your intent, or should we treat it differently?"*

If the signal is genuinely split (e.g. a product with a big marketing landing), ask the user directly to clarify what you cannot infer. Ask which register describes the **primary** surface. The register can be overridden per task later, but the project brief carries one default.

### Users & Purpose
- Who uses this? What's their context when using it?
- What job are they trying to get done?
- For brand: what emotions should the interface evoke? (confidence, delight, calm, urgency)
- For product: what workflow are they in? What's the primary task on any given screen?

### Brand & Personality
- How would you describe the brand personality in 3 words?
- Reference sites or apps that capture the right feel? What specifically about them?
  - For brand, push for real-world references in the right lane (tech-minimal, editorial-magazine, consumer-warm, brutalist-grid, etc.), not generic "modern" adjectives.
  - For product, push for category best-tool references (Linear, Figma, Notion, Raycast, Stripe).
- What should this explicitly NOT look like? Any anti-references?

### Accessibility & Inclusion
- Specific accessibility requirements? (WCAG level, known user needs)
- Considerations for reduced motion, color blindness, or other accommodations?

Skip questions where the answer is already clear. **Do NOT ask about colors, fonts, radii, or visual styling here.** Those belong in DESIGN.md, not the project brief.

## Step 4: Write PROJECT-BRIEF.md

Write PROJECT-BRIEF.md only after the user has confirmed the strategic answers from Step 3. If an inferred answer is uncertain or unconfirmed, ask before writing.

Synthesize into a strategic document using the project-context frontmatter convention:

```markdown
---
register: product
---

# Project Brief

## Source Of Truth
[List raw brief files, client docs, external docs, or state that this file is the initial source of truth.]

## Context
[What this project is, who owns it, where it operates, and the current stage.]

## Users
[Who they are, their context, the job to be done]

## Product Purpose
[What this product does, why it exists, what success looks like]

## Business Rules
[Non-negotiable claims, compliance constraints, pricing/content rules, service areas, data requirements, or domain facts]

## Brand Voice
[Voice, tone, 3-word personality, emotional goals]

## Anti-references
[What this should NOT look like. Specific bad-example sites or patterns to avoid.]

## Success Criteria
[Measurable or observable outcomes.]
```

The `register` frontmatter value is either `brand` or `product`.

Write to `PROJECT_ROOT/PROJECT-BRIEF.md` unless the project already has a `*-project-brief.md` file. If `.impeccable.md` or `.lunacraft.md` existed, the loader already renamed it; merge into that content rather than starting from scratch. Existing legacy `PRODUCT.md` remains readable but new projects should use the project-brief convention.

## Step 5: Decide on DESIGN.md

Offer `/lunacraft document` either way. Two paths:

- **Code exists** (CSS tokens, components, a running site): "I can generate a DESIGN.md that captures your visual system (colors, typography, components) so variants stay on-brand. Want to do that now?"
- **Pre-implementation** (empty project): "I can seed a starter DESIGN.md from five quick questions about color strategy, type direction, motion energy, and references. You can re-run once there's code, to capture the real tokens. Want to do that now?"
- **No TECHNICAL.md exists**: mention that the separate project-context skill can create one for stack, commands, integrations, hosting, test strategy, and known gotchas.

If the user agrees, delegate to `/lunacraft document` (it auto-detects scan vs seed). Load its reference and follow that flow.

If the user prefers to skip, mention they can run `/lunacraft document` any time later.

## Step 6: Confirm and wrap up

Summarize:
- Register captured (brand / product)
- What was written (PROJECT-BRIEF.md, DESIGN.md, or both)
- The 3-5 strategic principles from the project brief that will guide future work
- If DESIGN.md is pending, remind the user how to generate it later

**Critical: re-run the loader to refresh session context.** After writing PROJECT-BRIEF.md, run `node $HOME/.claude/skills/lunacraft/scripts/load-context.mjs` one final time and let its full JSON output land in conversation. This ensures subsequent commands in this session use the freshly-written project brief, not a stale earlier version.

If teach was invoked as a blocker by another LunaCraft command (e.g. the user ran `/lunacraft polish` with no project brief), resume that original task now with the fresh context.

Optionally ask the user directly to clarify what you cannot infer. Ask whether they'd like a brief summary of the project brief appended to the project `CLAUDE.md` for easier agent reference. If yes, append a short **Design Context** pointer section there (update in place if a legacy `.cursorrules` already holds the section, and note the preferred home is `CLAUDE.md`).

