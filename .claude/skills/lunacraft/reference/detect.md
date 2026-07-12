# LunaCraft detect (automatic scanner)

**Users do not run this.** When the user says “improve this section” or “elevate this,” the agent runs LunaCraft detect on changed markup **before** claiming the pass is complete.

## One-time setup (agent or maintainer)

From the LunaCraft skill folder:

```bash
npm install --prefix "$HOME/.claude/skills/lunacraft"
```

Windows (PowerShell):

```powershell
npm install --prefix "$env:USERPROFILE\.claude\skills\lunacraft"
```

## Command (agents only)

```bash
node "$HOME/.claude/skills/lunacraft/scripts/detect.mjs" --json [file-or-dir...]
```

**Exit codes:** `0` = clean, `2` = findings (treat P0-class issues as blockers per improve/elevate close gates).

Engine notes (impeccable 3.x, 45 deterministic rules):

- `--fast` is deprecated upstream and ignored (full scan always runs; it is ~4ms/file). Do not pass it.
- **Design-system aware:** when the project has `DESIGN.md`, detect also flags font/color/radius drift against the documented tokens. Pass `--no-design-system` for the global ruleset only.
- **Intentional exceptions:** waive a finding with an in-file comment — `impeccable-disable <rule>` (whole file), `impeccable-disable-line`, `impeccable-disable-next-line` — or via shared config with `node node_modules/impeccable/cli/bin/cli.js ignores`. Use narrowly and only for confirmed-intentional design; never to silence a real finding.
- `--gpt` enables provider-specific rules (e.g. decorative grid-line backgrounds) that are off by default.

## Required in workflows

| Workflow | When |
|----------|------|
| **improve** | Step 1 Assessment B (diagnosis) + Step 4 reconcile on changed paths |
| **elevate** | Step 2.5 reconcile on changed paths |
| **critique** | Assessment B when scanning source files |

Cannot mark improve/elevate **complete** if detect was skipped on markup targets, or if P0 findings + hierarchy budget P0s remain unfixed.

## Engine + ownership

- **LunaCraft** owns the CLI entry (`detect.mjs`, `bin/lunacraft.mjs`) and skill integration.
- **Detect rules engine** is vendored via npm dependency `impeccable` (Apache-2.0) until LunaCraft-native rules are forked in-tree.
- **Hierarchy budget** (rail inversion, phantom steps, etc.) is enforced by [composition-guardrails.md](composition-guardrails.md) grep checklist in addition to detect.

## Optional PATH install

After `npm install` in the skill folder:

```bash
npm link --prefix "$HOME/.claude/skills/lunacraft"
```

Then `lunacraft detect --json src/` works globally. Agents should still prefer the `node …/scripts/detect.mjs` path for portability.
