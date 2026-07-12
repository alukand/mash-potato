# Enhance Pass (improve + elevate, one shot)

One command for the common real-world loop: fix what's wrong, then make it bold — without running two passes. Enhance orchestrates [improve.md](improve.md) and [elevate.md](elevate.md); it does not duplicate their content. Load both alongside this file.

**Browser: never.** No preview, no screenshots, no dev-server launch, no "quick visual check" — under any phrasing of this command. All verification is code-level (read the diff, grep selectors, run detect, build/lint). The visual-reconcile steps in improve (4.5) and elevate (2.6) are N/A here because a browser is never used. If the user wants to see it, they will say so in their own words in a later prompt; that is a separate task, not part of enhance.

## Flow

1. **Diagnose (improve Step 1)** — full code-first diagnosis.
2. **Elevate assessment (elevate Step 1)** — run it now, against the *diagnosed* state, so one plan covers both: visual intensity, personality, ambition. Respect the elevate preserve contract and "stays inside the design system" rule from SKILL.md.
3. **Merged summary — usually non-blocking.** Present one compact block: issues found (improve format) + planned elevation moves. **Do not wait for confirmation** — continue straight into fixes — *except* when the plan includes section topology changes (elevate Step 1.5 trigger) or touches an improve "Preserve" media/grid item; only then stop for one checkpoint covering both.
4. **Fix (improve Step 3)** — dispatch and fix all confirmed structural/functional issues first. Corrective before additive, always.
5. **Elevate (elevate Step 2)** — dispatch enhancement passes on the now-sound structure. Bolder applies to the primary column only; typeset before bolder on split layouts (SKILL.md close gates).
6. **Single reconcile** — run improve Step 4 / elevate Step 2.5 **once**, at the end: LunaCraft detect on all changed markup, hierarchy budget, project design gates when present. One detect run covers both phases.
7. **Single close (hard gate)** — one merged close-out satisfying both improve Step 5 and elevate Step 3: issues fixed, elevation moves made, detect result, P0s cleared, plus the SKILL.md **magnitude honesty** line (requested magnitude vs delivered). Note `browser verify: never (enhance)` where a close-out has such a field.

## Rules

- **Ambition mismatch is a stop condition.** If the request carries re-direction signals (rejects brand fit, "significant redesign", "looks generic", donor/competitor sameness), do not run enhance — route to [redesign.md](redesign.md) per SKILL.md rule 4.6. If you only notice mid-pass that every planned move is in-system while the ask was identity-level, stop at the merged summary, say so, and offer redesign; do not push through to a green close that misses the point.
- Enhance is **not** polish and **not** animate. If the user asks for design-lock QA or motion, route there; recommend them after close only if genuinely warranted, in one line, without running them.
- If diagnosis finds the structure too broken for elevation (elevate Step 0 would fail even after fixes), do the improve phase, say elevation was skipped and why, and stop — a completed improve beats a forced elevate.
- Skip-list discipline: anything elevate would add that conflicts with an improve fix loses; corrective wins.
- All improve dispatch passes and elevate dispatch passes remain available exactly as their own files define them.
