#!/usr/bin/env node
/**
 * LunaCraft detect — branded entry for the markup anti-pattern scanner.
 * Installed once under this skill folder (npm install in LUNACRAFT_SKILL_ROOT).
 * Agents call this from improve / elevate / critique; users do not run it manually.
 */
import { spawnSync } from 'node:child_process';
import {
  LUNACRAFT_SKILL_ROOT,
  impeccableCliPath,
  isDetectEngineInstalled,
} from './lunacraft-root.mjs';

const args = process.argv.slice(2);

if (!isDetectEngineInstalled()) {
  process.stderr.write(
    '[lunacraft] Detect engine is not installed.\n' +
      `  Run once: npm install --prefix "${LUNACRAFT_SKILL_ROOT}"\n`,
  );
  process.exit(1);
}

const cli = impeccableCliPath();
const result = spawnSync(process.execPath, [cli, 'detect', ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
