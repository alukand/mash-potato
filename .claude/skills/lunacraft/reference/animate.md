# Animate Pass

Post-polish, **non-destructive** motion pass. Add entrances, scroll reveals, hover stacks, idle presence, and micro-rewards without changing layout structure, resting colors, typography scale, spacing, copy, or decorative elements.

**This file owns the entire animate workflow.** Do not substitute planning, a single fade-in, or generic hover tweaks for Steps 0–4 below. For deeper motion theory (timing tables, easing rationale, performance), see [motion-design.md](motion-design.md).

## Entry gates

- **Polished target required.** If spacing, alignment, tokens, or interaction states are still drifting → stop, run **polish** first.
- **Motion-only.** Do not run **elevate** (it changes visual design). Animate adds motion only.
- **Non-destructive at rest.** Resting design is locked. Transient hover/focus/active motion (glow, shadow, transform, scroll reveal) is allowed.

> **Additional context needed**: performance constraints — ask if mobile budget or reduced-motion scope is unclear.

---

## Step 0: Audit (before any code)

Inspect the target. Write a short audit in the response **before editing files**:

1. Section name and **register** (brand / product)
2. Section role (hero, CTA, content, supporting) → sets **intensity budget**
3. Which of the **6 layers** apply (mark N/A with reason for product register)
4. List every interactive element and every content block — these are your implementation targets
5. Confirm polished (yes → proceed; no → redirect to polish)

**Do not skip Step 0.** A pass that jumps straight to code will miss layers.

---

## Step 1: Implement layers (in order)

Work **Layer 1 → Layer 6** sequentially. Implement in code for every applicable item. Intensity scales with section role (hero max; supporting restrained).

### Layer 1 — Entrance

- Below-fold **every content block**: scroll-triggered entrance. **Prefer CSS scroll-driven animations** (`animation-timeline: view()`) — compositor-friendly, zero JS; wrap in `@supports (animation-timeline: view())` with Intersection Observer as the fallback for older targets
- Stagger within groups: `50–100ms × index`, total cap ~500ms
- Use **transform + opacity** only (not layout properties)
- **LCP guard:** above-fold/hero visible immediately OR CSS-only load-in — never `opacity: 0` waiting on JS for LCP candidates
- **Brand:** hero load-in choreography (staggered fade/slide)
- **Product:** no page-load choreography; scroll/view-change only

### Layer 2 — Hover / focus

- **Every** interactive element: hover **and** focus-visible response
- **Primary** (CTAs, hero controls): **4+** simultaneous property changes (e.g. translate + shadow + color + detail)
- **Content** (cards, lists): **3–4** property changes
- **Supporting** (icons, badges, nav): **2–3** property changes
- **Utility** (inputs): focus/active border + shadow
- No single-property-only hovers (`hover:scale` alone = fail). No hover-only functionality.

### Layer 3 — State change

- Show/hide, expand/collapse, tabs: **200–300ms** animated
- Exit ~75% of enter duration
- Loading, success, error states animated
- Accordion: chevron rotation; height via grid-rows or FLIP — not raw `height`

### Layer 4 — Idle presence

- **Brand default:** one **named idle element** after entrances finish (CTA glow, breathe, pulse)
- **Product:** N/A unless justified

### Layer 5 — Scroll response

- Scroll-linked behavior where it serves the story (parallax, sticky state, progress) — prefer CSS `animation-timeline: scroll()` over JS scroll listeners
- Parallax max **2–3** layers; unobserve after trigger. Parallax is a known vestibular trigger (WCAG 2.3.3) — the reduced-motion branch must remove it entirely, not soften it
- Full-viewport hero: scroll affordance (indicator or teaser)

### Layer 6 — Micro-reward

- Audit interactive **and** non-button visual elements
- **4 layers per reward:** (1) color shift, (2) glow ≥0.1 opacity, (3) movement, (4) secondary detail
- On colored elements: brighten/glow — do not recolor the base

### Register fork

| Register | Scope |
|---|---|
| **Brand** | Full layers 1–6 |
| **Product** | 150–250ms state/feedback only; skip idle, scroll choreography, page load unless justified |

### Guards (apply while implementing)

- Timing: 100–150ms press; 200–300ms hover/menu; 300–500ms modal; 500–800ms entrances only
- Easing: ease-out-quart/quint/expo — no bounce, no elastic
- `prefers-reduced-motion` at **component** level (not page-wide nuke unless project already does)
- Performance: transform/opacity primary; no casual layout animation

---

## Step 2: Verify (browser only if explicitly requested)

**Default: code-level verification.** Browser/preview/screenshot verification is OFF unless the user explicitly asked for it in their prompt. By default, verify in code:

- Read every changed file: confirm entrance triggers (view-timeline / IO / animation classes) attach to the right selectors and no LCP content starts hidden without a fallback
- Confirm hover/state/idle/micro-reward styles exist with multi-property stacks (grep the selectors)
- Verify the `@media (prefers-reduced-motion: reduce)` branch exists at component level
- Run build/lint to confirm nothing broke

**If the user explicitly requested browser verification**, additionally inspect in a browser (or dev server preview):

- Scroll the section: entrances fire, stagger reads intentional, no LCP content hidden on load
- Hover and Tab through interactives: multi-property feedback on every element
- Trigger state changes (accordion, tabs, loading if present)
- Confirm idle element visible after entrances complete (brand)
- Toggle reduced-motion in devtools

When browser verification was requested but unavailable, say so and list what you could not verify.

---

## Step 3: Mandatory close-out

**You may not finish an animate pass without emitting this block** with real evidence (file paths, class names, selectors — not placeholders):

```markdown
**Animation check — [Section Name]**
Register: brand | product
| Layer | Status | Evidence |
|-------|--------|----------|
| Entrance | ✓/✗/N/A | [e.g. IO on `.card`, stagger 80ms — `Section.astro` L42] |
| Hover | ✓/✗ | [e.g. CTA 4 props: translate, shadow, ring, arrow — `Button.tsx`] |
| State | ✓/✗/N/A | [transitions] |
| Idle | ✓/✗/N/A | [named element: `.hero-cta` glow keyframes] |
| Scroll | ✓/✗/N/A | [type] |
| Micro-reward | ✓/✗ | [elements + 4-layer stack] |
Reduced motion: ✓/✗ — [where handled]
Browser verified: ✓/✗/skipped (not requested) — [viewports checked, or "code-level verify only"]
```

Any layer marked ✗ = keep implementing until ✓ or justified N/A. **A single fade-in is not a completed animate pass.**

---

## Step 4: Close message

> **Animate complete.** [One line: layers added]. Design unchanged at rest.
>
> Ship, or re-run polish if animate exposed spacing/token drift.

Do NOT run polish automatically unless drift was introduced.

---

## Reference (patterns and technique — use during Step 1, not instead of it)

### Register notes

**Brand:** orchestrated page-load sequences, staggered reveals, scroll-driven animation. One well-rehearsed entrance beats scattered micro-interactions.

**Product:** 150–250 ms on most transitions. Motion conveys state only. No page-load choreography.

### Named motion patterns

- **Magnetic Elements**: `useMotionValue` + `useTransform` — never `useState` for cursor tracking
- **Kinetic Marquee**: CSS `translateX` or JS for variable-speed marquees
- **Staggered Orchestration**: `staggerChildren` or `animation-delay: calc(var(--index) * 80ms)`
- **Spring Physics**: mass/tension/damping for toggles, drag
- **Scroll-Triggered Reveals**: CSS `animation-timeline: view()` + `animation-range` first; IO (`threshold: 0.2`, unobserve after fire) as fallback; stagger within groups
- **Parallax Layers**: max 2–3 layers
- **Hover Morph**: `layoutId` for shared element morphs

### Timing and easing

```css
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

Exit animations ~75% of enter duration. No bounce, no elastic.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .reveal { animation: none; transition: none; opacity: 1; transform: none; }
}
```

Replace spatial motion with crossfade or instant state — do not only slow animations down.

### NEVER

- Finish without the Step 3 close-out block
- Single-property hovers or one global fade as the whole pass
- `opacity: 0` on above-fold/LCP content waiting for JS
- Change resting layout, palette, typography, or spacing
- Ignore `prefers-reduced-motion`
- Animate layout properties casually when transform/FLIP works
