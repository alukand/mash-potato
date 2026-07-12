#!/usr/bin/env node
/**
 * LunaCraft project design gate — enforces per-project rules from
 * .lunacraft/design.json (projectGates) when present. Other projects: no-op.
 *
 * Usage:
 *   node project-design-check.mjs [--json] <file-or-dir>...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { loadContext } = await import(pathToFileURL(path.join(__dirname, 'load-context.mjs')).href);

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const fileArgs = args.filter((a) => a !== '--json');

const cwd = process.cwd();
const context = loadContext(cwd);
const contextDir = context.contextDir || cwd;

function readProjectGates() {
  const designJsonPath = path.join(contextDir, '.lunacraft', 'design.json');
  if (!fs.existsSync(designJsonPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(designJsonPath, 'utf-8'));
    return data.projectGates ?? null;
  } catch {
    return null;
  }
}

const gates = readProjectGates();

if (!gates) {
  if (jsonOut) {
    console.log(JSON.stringify({ skipped: true, reason: 'no projectGates in .lunacraft/design.json' }));
  }
  process.exit(0);
}

const forbidden = gates.forbiddenGrep ?? [];
const review = gates.reviewGrep ?? [];

function expandTargets(inputs) {
  const out = [];
  for (const input of inputs) {
    const resolved = path.resolve(cwd, input);
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      walk(resolved);
    } else {
      out.push(resolved);
    }
  }
  return out;

  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(astro|tsx|jsx|vue|html|css)$/i.test(ent.name)) out.push(p);
    }
  }
}

const targets = expandTargets(fileArgs);
if (targets.length === 0) {
  if (jsonOut) {
    console.log(JSON.stringify({ skipped: true, reason: 'no scannable files' }));
  }
  process.exit(0);
}

const findings = [];

for (const filePath of targets) {
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  const rel = path.relative(cwd, filePath);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    for (const pat of forbidden) {
      if (line.includes(pat)) {
        findings.push({
          severity: 'P0',
          file: rel,
          line: lineNo,
          pattern: pat,
          message: `Forbidden (${gates.name ?? 'project'}): "${pat}"`,
          snippet: line.trim().slice(0, 140),
        });
      }
    }
    for (const pat of review) {
      if (line.includes(pat)) {
        findings.push({
          severity: 'P1',
          file: rel,
          line: lineNo,
          pattern: pat,
          message: `Hairline risk (${gates.name ?? 'project'}): prefer tonal bg, .border-warm, or stronger ink border`,
          snippet: line.trim().slice(0, 140),
        });
      }
    }
  });
}

const p0 = findings.filter((f) => f.severity === 'P0');

const report = {
  project: gates.name ?? path.basename(contextDir),
  contextDir,
  scanned: targets.map((t) => path.relative(cwd, t)),
  p0Count: p0.length,
  p1Count: findings.length - p0.length,
  findings,
  guidance: gates.guidance ?? null,
};

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else if (findings.length === 0) {
  console.log(`[lunacraft] Project design gate PASS (${report.project})`);
} else {
  for (const f of findings) {
    console.log(`${f.severity} ${f.file}:${f.line} ${f.message}`);
    console.log(`  ${f.snippet}`);
  }
}

process.exit(p0.length > 0 ? 2 : 0);
