#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDetectEngineInstalled, LUNACRAFT_SKILL_ROOT } from '../scripts/lunacraft-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const detectScript = path.join(LUNACRAFT_SKILL_ROOT, 'scripts', 'detect.mjs');

const [subcommand, ...rest] = process.argv.slice(2);

function help() {
  process.stdout.write(`LunaCraft CLI (skill-local)

Commands:
  detect [options] [paths...]   Scan markup for UI anti-patterns (--json, --fast)
  help                          Show this message

Detect is required inside LunaCraft improve / elevate before close.
Install engine once: npm install --prefix "${LUNACRAFT_SKILL_ROOT}"

`);
}

if (!subcommand || subcommand === 'help' || subcommand === '--help') {
  help();
  process.exit(0);
}

if (subcommand === 'detect') {
  if (!isDetectEngineInstalled()) {
    process.stderr.write(
      '[lunacraft] Detect engine is not installed.\n' +
        `  Run once: npm install --prefix "${LUNACRAFT_SKILL_ROOT}"\n`,
    );
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [detectScript, ...rest], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  process.exit(result.status === null ? 1 : result.status);
}

process.stderr.write(`[lunacraft] Unknown command: ${subcommand}\n`);
help();
process.exit(1);
