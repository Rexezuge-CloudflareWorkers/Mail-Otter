#!/usr/bin/env node

/**
 * Fail when the SPA's stylesheet has lost the kit's utilities.
 *
 * The Worker serves the SPA shell from the _last local build*, and `apps/web/dist` is
 * gitignored, so a source change here is inert until `vite build` runs again. That is
 * already true of the shell itself; this check covers the half nothing else looks at.
 *
 * The shell can be entirely consistent — the HTML and the JS agree, every asset path
 * resolves, the stub is long gone — and still ship a stylesheet with none of the kit's
 * classes in it, which is the same blank-operator-UI outcome by a different road. In
 * the artefacts a consistent shell that styles nothing looks exactly like a working
 * one, so only the CSS itself can tell, and only a check reads it.
 *
 * **The build is a precondition of this check, not a convenience.** The bundle is
 * gitignored, so verifying without building cannot pass — and cannot pass *honestly*
 * either, which is the failure this script exists to prevent: a check that runs
 * against whatever `dist/` happened to be lying around.
 *
 * It is a CI step rather than only a local one, in the `build` job of
 * `.github/workflows/continuous-integration.yml`, which builds and then verifies. A
 * check that only runs locally fails on a machine instead of on a merge.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { checkKitCss } from './kit-css-checks.ts';

/**
 * Every emitted stylesheet, concatenated.
 *
 * Concatenated rather than asserting exactly one: Vite emits one file per CSS entry,
 * and this check asks "does any sheet the Worker will serve carry these utilities",
 * which stays true — and true for the right reason — if an entry is ever split.
 */
function readCssBundle(root: string): string | null {
  const assets = path.join(root, 'apps/web/dist/assets');
  let files: string[];
  try {
    files = readdirSync(assets).filter((file) => file.endsWith('.css'));
  } catch {
    return null;
  }
  if (files.length === 0) {
    return null;
  }
  return files.map((file) => readFileSync(path.join(assets, file), 'utf8')).join('\n');
}

const problems = checkKitCss(readCssBundle(process.cwd()));

if (problems.length > 0) {
  console.error('Kit CSS check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('Kit CSS check passed (apps/web/dist styles the kit primitives).');