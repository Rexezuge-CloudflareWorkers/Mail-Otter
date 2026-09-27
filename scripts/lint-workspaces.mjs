#!/usr/bin/env node
/**
 * Lint every workspace package in its own ESLint process.
 *
 * Why: `eslint .` loads one TypeScript program per tsconfig and keeps them all
 * resident. On the full monorepo that exceeds the default V8 heap and the run
 * dies with "JavaScript heap out of memory" before reporting anything. Linting
 * one package at a time bounds peak memory to the largest single program and
 * lets each package reuse ESLint's cache.
 *
 * Usage:
 *   node scripts/lint-workspaces.mjs            # check only (CI)
 *   node scripts/lint-workspaces.mjs --fix      # autofix
 */
import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shouldFix = process.argv.includes('--fix');
const eslintArgs = ['--quiet', ...(shouldFix ? ['--fix'] : [])];

// Root-level targets that are not inside a workspace package.
const rootTargets = ['test', 'vitest.config.mts']
  .filter((target) => existsSync(join(repoRoot, target)))
  .map((target) => ({ label: target, path: target }));

// Bounded per-process heap. Small enough to fit a 1 GB dev box, far above what
// a single package program needs.
const NODE_OPTIONS = process.env.LINT_NODE_OPTIONS ?? '--max-old-space-size=2048';

const workspaceDirs = ['apps', 'packages']
  .flatMap((parent) => {
    const parentPath = join(repoRoot, parent);
    if (!existsSync(parentPath)) return [];
    return readdirSync(parentPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parentPath, entry.name));
  })
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .map((dir) => ({ label: dir.slice(repoRoot.length + 1), path: dir }));

if (workspaceDirs.length === 0) {
  console.error('lint-workspaces: no workspace packages found');
  process.exit(1);
}

const eslintBin = join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
const failures = [];
const startedAt = Date.now();

// One process per target keeps peak memory to a single TypeScript program.
const targets = [...workspaceDirs, ...rootTargets];

for (const { label, path: target } of targets) {
  process.stdout.write(`lint ${label} ... `);
  const result = spawnSync(process.execPath, [eslintBin, ...eslintArgs, target], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS },
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  if (result.status !== 0) {
    failures.push(label);
    console.log(`FAIL (${seconds}s elapsed)`);
  } else {
    console.log(`ok (${seconds}s elapsed)`);
  }
}

if (failures.length > 0) {
  console.error(`\nlint-workspaces: ${failures.length} target(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}

console.log(`\nlint-workspaces: ${workspaceDirs.length} packages + ${rootTargets.length} root target(s) clean.`);
