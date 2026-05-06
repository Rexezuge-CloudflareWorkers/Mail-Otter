#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'apps/api/src/generated/spa-shell.ts');

if (existsSync(outPath)) process.exit(0);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  "// Auto-generated stub - real content is produced by `npm run build` via the Vite plugin.\nexport const SPA_HTML: string = '';\n",
);
console.log(`ensure-spa-shell-stub: created stub at ${outPath}`);
