# Project design gates (per-project, not global)

Some projects define **hard visual rules** in `.lunacraft/design.json` → `projectGates` and/or `DESIGN.md`. Other projects omit `projectGates` — the check is a no-op.

**Users never run this.** Improve and elevate run it automatically on changed files before close.

## Agent command

```bash
node "$HOME/.claude/skills/lunacraft/scripts/project-design-check.mjs" --json [changed-file...]
```

Run from the **project root** (where `.lunacraft/design.json` lives). Exit `0` = pass, `2` = P0 forbidden patterns found.

## Improve / elevate requirement

After edits, before close:

1. `node …/load-context.mjs` — confirm `hasDesign` and note `contextDir`.
2. `node …/project-design-check.mjs --json` on **every changed** `.astro` / `.tsx` / `.css` path.
3. **P0 findings:** fix in the same pass (remove forbidden tokens; replace hairline dividers with tonal background shifts per project `guidance`). Re-run until P0 = 0.
4. **P1 findings:** fix when they match the user’s complaint (white-reading hairlines). Do not close with unresolved P1 on the target section.

If `projectGates` is missing, skip silently.

## Prevention (new markup)

When adding callouts, sidebars, or map labels in a gated project:

- Read `projectGates.guidance` and matching `DESIGN.md` **Named Rules** marked **hard**.
- Copy border vocabulary from sibling markup in the same file (e.g. `.panel-callout`, `.border-warm`) — do not invent `border-white/*` or faint `border-t` on dark panels.
- Map overlays: **solid** chip (ember or ink), high-contrast text — no semi-transparent labels on iframe maps.
