# Redesign Flow (re-direction for existing surfaces)

Change the visual identity of an app or surface that already exists and works. Craft builds new; improve/elevate/enhance iterate **inside** the current system; redesign renegotiates the system itself, then applies it. This is the only command where DESIGN.md is the subject of the work instead of a constraint on it.

**Entry condition:** the user rejects the current look at identity level — "doesn't feel like our brand", "significant redesign", "looks generic", "still looks like [donor/competitor]", "not excited to open it", "new look" — or an iterate command escalated here via the SKILL.md escape valve.

**Not for:** structural bugs (improve), in-system boldness (elevate), motion (animate), pixel QA (polish). If the user likes the identity and wants it stronger, that is elevate, not redesign.

**Browser: never**, same as enhance. All verification is code-level.

## Step 0: Load and frame

1. Loader + register reference per SKILL.md setup (skip what's already in session).
2. Read the project brief's Users, Brand Voice, and Anti-References sections; they are binding inputs to Step 2.
3. **Donor provenance:** if DESIGN.md describes itself as adapted, transplanted, or carried over from another project, say so plainly: the current system documents the donor, and this pass replaces it. That framing is why in-system passes could never satisfy this request.
4. **Preserve inventory (state it, don't ask):** framework, component mechanics (dropdowns, dialogs, form wiring), information architecture, data, and business copy survive unless the user says otherwise. Redesign changes the voice, not the plumbing.

## Step 1: Discovery (compact; reuse shape.md machinery)

Run shape.md's Design Direction discovery scoped to identity. Skip anything the brief or the user's prompt already answers; ask only what's missing, 2-3 questions per round, one round default.

- **Audience scene(s)** per product.md § Audience scene: who uses each key surface, doing what, how often, what confusion costs them. **If the scene cannot be written from the brief — audience, comfort level, context, or frequency unknown — ask the user and wait. Never assume a demographic or invent one from the product category.**
- Color strategy (Restrained / Committed / Full palette / Drenched) for the app's core surfaces.
- Theme scene sentence (forces light vs dark default).
- 2-3 named anchor references and the anti-references that bound the space. Ask the user once; references are **optional input, never a blocker**. If the user has none, or the category's design ceiling is low and the goal is to leapfrog it, self-author per SKILL.md § Anchor references: import named anchors from adjacent worlds and treat the modal competitor page as the anti-reference. Do not stall on missing references and do not compensate with a safe default.

## Step 2: Direction concepts (the creativity step)

Present **2 or 3 genuinely different named directions**. Each is a committed point of view, not a palette tweak of the current system:

- **Name + one-line philosophy** (what the interface believes).
- **Color strategy + palette moves** (OKLCH anchors, what carries the surface, what the accent does).
- **Type voice** (faces and scale posture; name real fonts, avoid the SKILL.md monoculture list unless earned).
- **Signature moves** (3-5 concrete, ownable patterns: how status reads, how primary actions look, the recurring motif someone would recognize this app by).
- **What survives** from the current system and why.
- **Audience fit** (one line: how this direction serves the audience scene).

Directions must differ on at least two of: color strategy, type voice, density posture, signature moves. Run the category-reflex check (first- and second-order) on each: a direction guessable from the domain is not a direction. Respect the brief's anti-references by name.

**Comp scope:** when directions are shown as built mockups (not just written concepts), each direction gets hero + 1-2 signature-bearing sections only, at full craft — never the whole page. Full-page build happens after the pick (SKILL.md § Mockups and imagery, Direction comp scope).

**Hard gate: stop and wait for the user to pick, blend, or redirect.** Never proceed on silence; never pick for them.

## Step 3: Rewrite DESIGN.md first

The chosen direction becomes the system **before** any component changes:

1. Rewrite DESIGN.md following document.md conventions (frontmatter tokens, named rules, Do's and Don'ts carrying the brief's anti-references verbatim). Old-system rules that survive get restated deliberately, not assumed.
2. Regenerate `.lunacraft/design.json` if the project has one.
3. Update the token layer the code actually consumes (CSS variables, tailwind config) so the new system is real, not documentation fiction.

## Step 4: Apply

**4a. Audience-fit recomposition (before any skinning).** For each key surface, run SKILL.md § Audience fit: write the scene and name what this surface is FOR in this audience's life. If the existing composition serves the donor's data model or a template instead of that purpose — CRUD tables where a story belongs, a generic grid for sparse content, infrastructure vocabulary in user-facing copy, Edit/Delete offered on every row of rare-edit data — **recompose the surface first**. Re-skinning an ill-fitting composition is a failed apply: the close-out must say so, not "complete". Checkpoint per elevate Step 1.5 only when a recomposition changes topology dramatically.

**4b. Re-skin.** Then improve-style sequential passes: **primitives first** (tokens, shared components) so identity propagates everywhere at once, then the named surfaces (colorize → typeset → layout as each surface needs). Detect + close gates per SKILL.md apply. The product.md **confidence test** runs on every redesigned surface.

**4c. Primitive re-audit on the new ground.** Retokening silently breaks constructions that borrowed contrast from the old palette: a white thumb that read as "selected" on cool gray reads as an empty outlined button on warm paper; a well-gray input that read as "field" on stark white reads as disabled on a warm sheet. After tokens land, walk every interactive primitive's states (rest, hover, selected, disabled, focus) on the new surfaces and re-derive any state whose meaning depended on the old contrast — do not assume a primitive that was correct before the retoken is correct after it.

If the target list is large, deliver in waves (primitives + the highest-traffic surface first) and say plainly which surfaces still read as the old system.

## Step 5: Close

Standard close-out plus **magnitude honesty**: the request was re-direction, so the close states what identity-level change shipped (system, primitives, which surfaces) and what still looks old. A close that lists only in-system tweaks is "not done as asked", never "complete". Recommend polish → animate afterward; do not run them.
