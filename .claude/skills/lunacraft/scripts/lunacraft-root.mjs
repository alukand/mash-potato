import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to ~/.claude/skills/lunacraft (this skill install). */
export const LUNACRAFT_SKILL_ROOT = path.resolve(__dirname, '..');

export function impeccableCliPath() {
  return path.join(LUNACRAFT_SKILL_ROOT, 'node_modules', 'impeccable', 'cli', 'bin', 'cli.js');
}

export function detectBrowserEnginePath() {
  return path.join(
    LUNACRAFT_SKILL_ROOT,
    'node_modules',
    'impeccable',
    'cli',
    'engine',
    'detect-antipatterns-browser.js',
  );
}

export function isDetectEngineInstalled() {
  return fs.existsSync(impeccableCliPath());
}
