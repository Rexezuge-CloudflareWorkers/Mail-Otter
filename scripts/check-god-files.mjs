#!/usr/bin/env node
/**
 * Fail CI when source files grow back into god-files.
 *
 * Excludes: node_modules, dist, locales, generated, tests, migrations, lockfiles.
 * Soft limit 300 LOC (warn), hard limit 400 LOC (error).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SOFT = 300;
const HARD = 400;
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.wrangler', 'coverage', 'coverage-integration', '.git']);
const EXCLUDE_SUFFIX = ['.test.ts', '.spec.ts', '.int.test.ts', '.d.ts'];

function shouldSkip(path) {
  if (path.includes('/locales/') || path.includes('/generated/') || path.includes('/__tests__/') || path.includes('/__mocks__/')) return true;
  if (path.endsWith('.json') || path.endsWith('.sql') || path.endsWith('.md')) return true;
  if (EXCLUDE_SUFFIX.some((s) => path.endsWith(s))) return true;
  if (path.endsWith('/index.ts') && path.includes('backend-services/src')) return false;
  return false;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|mjs|cjs|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT).filter((f) => !shouldSkip(f));
let failed = false;
const over = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (lines > HARD) {
    failed = true;
    over.push({ file: relative(ROOT, file), lines, level: 'ERROR' });
  } else if (lines > SOFT) {
    over.push({ file: relative(ROOT, file), lines, level: 'WARN' });
  }
}
over.sort((a, b) => b.lines - a.lines);
for (const o of over.slice(0, 30)) console.log(`${o.level} ${o.lines} ${o.file}`);
if (failed) {
  console.error(`\nGod-file check failed: ${over.filter((o) => o.level === 'ERROR').length} file(s) exceed ${HARD} LOC. Split them.`);
  process.exit(1);
} else {
  console.log(`\nGod-file check passed (${files.length} files, ${over.length} over soft limit ${SOFT}).`);
}
