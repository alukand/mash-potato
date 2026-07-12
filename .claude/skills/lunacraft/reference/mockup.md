# Mockup Flow (mock-first design)

Think through a screen's design as a standalone comp BEFORE building it in the app. This is the owner's preferred process for new screens and redesigns (standing preference, 2026-07-04): mock → iterate on feedback → explicit approval → only then build real code.

**Entry:** the user asks for a mock/mockup/comp of a screen, wants to "see it before we build," or a redesign direction was picked and the composition needs working out. Not for single-element edits. Setup (context loader, register reference) per SKILL.md runs first; the project's design system is a binding constraint unless a redesign pass renegotiated it.

## Build rules

- **One file per arc.** All frames (page states, overlays, alternate screens) stack in ONE fluid HTML file with quiet uppercase frame labels between them. Iterations edit the SAME file. Never leave superseded comp files around — the owner opened a stale tab and asked "what happened to the main design?" (2026-07-04). Delete replaced comps.
- **Fluid width, always.** `max-width` + fluid grids (`minmax(0,1fr)`, `min()`, `clamp()`), never a fixed px page width. Comps get viewed in arbitrary windows; a fixed 1440px comp ran off the owner's screen.
- **Comp-local class prefixes.** In single-file comps, generic class names collide across frames: a `.in` field recipe painted over template-card overlays, and a `.plat` grid rule broke a table cell in another frame — each cost a full debugging round (2026-07-04). Prefix classes per frame or zone. Corollary: when a style mysteriously fails to apply, suspect a same-named rule elsewhere in the file FIRST, before caching or renderer theories.
- **Fidelity per SKILL.md § Mockups and imagery:** real webfonts, real verified imagery, project tokens.
- **Real content.** Use the client's actual data wherever known (metrics, names, phone numbers, live ad copy); plausible specifics elsewhere. Recognizable numbers make the comp judgeable; invented ones make it fiction.
- **Shared controls come from component source, never from memory** (owner correction 2026-07-05, AgencyOS AI Search comp: an invented text date chip shipped where every real page uses the DateRangePicker calendar icon button — owner: "I want it to be consistent across all pages"). Before composing, list the app-wide controls the screen inherits (date pickers, view toggles, status chips, count chips, field recipes, panel shells), READ each one's component file, and replicate its rendered look in the comp. If the project keeps a canonical-controls inventory (AgencyOS `DESIGN.md` §5), start there. Inventing a variant of an existing control is a defect on par with clipping — check for it in the screenshot pass.

## Verify before delivery (hard gate)

1. Render locally and screenshot at **two widths minimum** (wide desktop ~1540 and laptop ~1280). One-width checks let clipping through (a control group clipped at the panel edge shipped to the owner this way).
2. Actually look at the screenshots, checking: clipping/overflow on every control group at both widths; enterable fields visually distinct from choice controls (product.md § Shape vocabulary); text readable over imagery; no dead zones; fonts and images actually loaded; no charset mojibake.
3. Fix, re-capture, re-look. Deliver only when a full screenshot pass finds nothing.
4. **Deliver by opening the file in the user's default browser** (`Start-Process` / `open` / `xdg-open`) — ALWAYS, for every mock, unconditionally (owner rule 2026-07-06). Chat file links are not clickable in all clients, and Artifact CSP blocks external fonts and images — never deliver a comp through a channel you have not confirmed renders it. **Editor preview panels do not count as delivery**: the Claude Code preview/Launch tab auto-showing the file is a side effect, not the deliverable — the owner judges comps in a real browser tab, so open one even when a preview panel already rendered it.

Headless capture recipe (no dev server needed): `msedge|chrome --headless=new --screenshot=<out.png> --window-size=<w>,<h> --hide-scrollbars <file:///path>`.

## Iterate and close

- Each user feedback round: fix everything named, then re-run the FULL verify gate — their feedback does not replace your own screenshot pass, and new edits introduce new defects (class collisions, reflow clipping).
- **Hard gate: explicit user approval before building the real screen.** "Looks good, build it" starts implementation; silence does not.
- **Approval means the FULL WORKING FEATURE** (owner rule 2026-07-04, AgencyOS scoreboard: band shipped showing 0/0/0): backend, data joins, and empty/edge states included — "any time we are building a design, the assumption is that the backend will also be built." Before declaring built, verify the feature against the REAL stored data it will render, not against type declarations: a typed field can be silently unpopulated for years until your surface is its first consumer (AgencyOS: `position` was 0 in every stored row because the API parser read a nonexistent field). One runtime probe of actual rows is part of the build, not optional polish.
- On approval: log the durable design decisions to `DESIGN.md` (fact in place + changelog line + `last-verified` bump) BEFORE writing app code. The comp file is disposable; the decisions are not.
