/**
 * Shared context loader for every LunaCraft command that needs to know
 * "who is this for", "what does this look like", and "what technical
 * constraints shape implementation".
 *
 * Input: project root (process.cwd()).
 *
 * Output (JSON to stdout):
 *   {
 *     hasProjectBrief: boolean,       // project brief found or migrated
 *     projectBrief: string | null,    // project brief contents
 *     projectBriefPath: string | null,// relative path
 *     hasProduct: boolean,            // legacy alias for hasProjectBrief
 *     product: string | null,         // legacy alias for projectBrief
 *     productPath: string | null,     // legacy alias for projectBriefPath
 *     hasDesign: boolean,         // DESIGN.md found
 *     design: string | null,      // DESIGN.md contents
 *     designPath: string | null,
 *     hasTechnical: boolean,      // technical context found
 *     technical: string | null,   // technical context contents
 *     technicalPath: string | null,
 *     hasSeoKeywords: boolean,   // SEO-KEYWORDS.md found
 *     seoKeywordsPath: string | null, // relative path (no file body in JSON)
 *     migrated: boolean,          // true if we auto-renamed a legacy context file
 *     contextDir: string,         // absolute path of the directory the files were found in
 *   }
 *
 * Filename matching is case-insensitive for context files. The
 * Google DESIGN.md convention is uppercase at repo root; Kiro-style and
 * lowercase variants are also matched so users don't get punished for case.
 *
 * Lookup directory resolution (first match wins):
 *   1. process.env.LUNACRAFT_CONTEXT_DIR (absolute or relative to cwd)
 *      or process.env.IMPECCABLE_CONTEXT_DIR (legacy)
 *   2. cwd, if project brief / DESIGN.md / TECHNICAL.md / legacy context is there
 *   3. Auto-fallback subdirectories of cwd: .agents/context/, then docs/
 *   4. cwd as a default "no context found" location
 *
 * Legacy `.lunacraft.md` / `.impeccable.md` -> PROJECT-BRIEF.md migration only fires at cwd root;
 * fallback directories are read-only as far as auto-rename is concerned.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT_BRIEF_NAMES = [
  'PROJECT-BRIEF.md',
  'Project-Brief.md',
  'project-brief.md',
  'PROJECT_BRIEF.md',
  'Project_Brief.md',
  'project_brief.md',
  'BRIEF.md',
  'Brief.md',
  'brief.md',
];
const PRODUCT_NAMES = ['PRODUCT.md', 'Product.md', 'product.md'];
const DESIGN_NAMES = ['DESIGN.md', 'Design.md', 'design.md'];
const TECHNICAL_NAMES = [
  'TECHNICAL.md',
  'Technical.md',
  'technical.md',
  'TECHNICAL-CONTEXT.md',
  'Technical-Context.md',
  'technical-context.md',
];
const LEGACY_NAMES = ['.lunacraft.md', '.impeccable.md'];
const SEO_KEYWORDS_NAMES = [
  'SEO-KEYWORDS.md',
  'Seo-Keywords.md',
  'seo-keywords.md',
  'SEO_KEYWORDS.md',
];
const FALLBACK_DIRS = ['.agents/context', 'docs'];

/**
 * Resolve the directory that holds LunaCraft context files for
 * this project. Exported so other scripts (e.g. live-server.mjs) can read the
 * design files from the same location the loader uses.
 */
export function resolveContextDir(cwd = process.cwd()) {
  // 1. Explicit override
  const envDir = process.env.LUNACRAFT_CONTEXT_DIR || process.env.IMPECCABLE_CONTEXT_DIR;
  if (envDir && envDir.trim()) {
    const trimmed = envDir.trim();
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
  }

  // 2. cwd wins if any canonical or legacy file is there. We check legacy too
  //    so the auto-migration path in loadContext stays predictable.
  if (hasAnyContext(cwd)) {
    return cwd;
  }

  // 3. Auto-fallback subdirs. Match if any context file is present;
  //    legacy LunaCraft/Impeccable files do not pull the lookup into a fallback dir.
  for (const rel of FALLBACK_DIRS) {
    const candidate = path.resolve(cwd, rel);
    if (hasAnyContext(candidate, { includeLegacy: false })) {
      return candidate;
    }
  }

  // 4. Nothing found — keep the historical "default to cwd" behaviour so the
  //    caller's `hasProduct === false` branch still fires the same way.
  return cwd;
}

export function loadContext(cwd = process.cwd()) {
  let migrated = false;
  const contextDir = resolveContextDir(cwd);

  // 1. Prefer the project-brief convention. PRODUCT.md remains readable as a
  //    legacy fallback for existing Impeccable projects.
  let projectBriefPath = firstProjectBrief(contextDir);

  // 2. Legacy: if no project brief but .lunacraft.md or .impeccable.md exists at cwd root, rename
  //    it in place. We only migrate at the root — fallback dirs are read-only
  //    so we don't surprise users by mutating files under docs/ or .agents/.
  if (!projectBriefPath && contextDir === cwd) {
    const legacyPath = firstExisting(cwd, LEGACY_NAMES);
    if (legacyPath) {
      const newPath = path.join(cwd, 'PROJECT-BRIEF.md');
      try {
        fs.renameSync(legacyPath, newPath);
        projectBriefPath = newPath;
        migrated = true;
      } catch {
        // Rename failed (permissions, etc.) — fall back to reading legacy in place
        projectBriefPath = legacyPath;
      }
    }
  }

  // 3. DESIGN.md and TECHNICAL.md (case-insensitive)
  const designPath = firstExisting(contextDir, DESIGN_NAMES);
  const technicalPath = firstTechnical(contextDir);
  const seoKeywordsPath = firstExisting(contextDir, SEO_KEYWORDS_NAMES);

  const projectBrief = projectBriefPath ? safeRead(projectBriefPath) : null;
  const design = designPath ? safeRead(designPath) : null;
  const technical = technicalPath ? safeRead(technicalPath) : null;

  // Staleness signal: consuming agents compare these against recent decisions /
  // token-file changes and flag drift instead of silently trusting old context.
  const safeMtime = (p) => {
    try { return p ? fs.statSync(p).mtime.toISOString().slice(0, 10) : null; } catch { return null; }
  };

  return {
    hasProjectBrief: !!projectBrief,
    projectBrief,
    projectBriefPath: projectBriefPath ? path.relative(cwd, projectBriefPath) : null,
    projectBriefMtime: safeMtime(projectBriefPath),
    hasProduct: !!projectBrief,
    product: projectBrief,
    productPath: projectBriefPath ? path.relative(cwd, projectBriefPath) : null,
    hasDesign: !!design,
    design,
    designPath: designPath ? path.relative(cwd, designPath) : null,
    designMtime: safeMtime(designPath),
    hasTechnical: !!technical,
    technical,
    technicalPath: technicalPath ? path.relative(cwd, technicalPath) : null,
    technicalMtime: safeMtime(technicalPath),
    hasSeoKeywords: !!seoKeywordsPath,
    seoKeywordsPath: seoKeywordsPath ? path.relative(cwd, seoKeywordsPath) : null,
    migrated,
    contextDir,
  };
}

function hasAnyContext(dir, { includeLegacy = true } = {}) {
  return !!(
    firstProjectBrief(dir) ||
    firstExisting(dir, DESIGN_NAMES) ||
    firstTechnical(dir) ||
    (includeLegacy && firstExisting(dir, LEGACY_NAMES))
  );
}

function firstProjectBrief(dir) {
  return firstExisting(dir, PROJECT_BRIEF_NAMES) || firstGlob(dir, /-project-brief\.md$/i) || firstExisting(dir, PRODUCT_NAMES);
}

function firstTechnical(dir) {
  return firstExisting(dir, TECHNICAL_NAMES) || firstGlob(dir, /-technical\.md$/i);
}

function firstGlob(dir, pattern) {
  try {
    const matches = fs.readdirSync(dir)
      .filter((name) => pattern.test(name))
      .sort((a, b) => a.localeCompare(b));
    return matches.length ? path.join(dir, matches[0]) : null;
  } catch {
    return null;
  }
}

function firstExisting(dir, names) {
  for (const name of names) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

// ---------------------------------------------------------------------------
// CLI mode — print the context as JSON
// ---------------------------------------------------------------------------

function cli() {
  const result = loadContext(process.cwd());
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}


