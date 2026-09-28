import { defineConfig } from 'vitest/config';
import { cloudflareTest, cloudflarePool } from '@cloudflare/vitest-pool-workers';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const apiSrcPath = fileURLToPath(new URL('../../apps/api/src', import.meta.url));
const backgroundSrcPath = fileURLToPath(new URL('../../apps/background/src', import.meta.url));
const backendDataSrcPath = fileURLToPath(new URL('../../packages/backend-data/src', import.meta.url));
const backendErrorsSrcPath = fileURLToPath(new URL('../../packages/backend-errors/src', import.meta.url));
const backendRuntimeSrcPath = fileURLToPath(new URL('../../packages/backend-runtime/src', import.meta.url));
const providerClientsSrcPath = fileURLToPath(new URL('../../packages/provider-clients/src', import.meta.url));
const sharedSrcPath = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));

const migrationsDir = resolve(fileURLToPath(new URL('../../migrations', import.meta.url)));
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const migrationFileList = migrationFiles.map((name) => ({ name, sql: readFileSync(resolve(migrationsDir, name), 'utf-8') }));
const migrationSql = migrationFileList.map((f) => f.sql).join('\n\n');

export default defineConfig({
  define: {
    __INTEGRATION_MIGRATION_SQL__: JSON.stringify(migrationSql),
    // File boundaries have to survive into the test runtime: the identity-upgrade
    // test applies a *range* of files, and D1 scopes PRAGMAs to the transaction, so
    // a file that opens with one has to be applied in its own `db.batch()`.
    __INTEGRATION_MIGRATION_FILES__: JSON.stringify(migrationFileList),
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './test/integration/wrangler.test.jsonc',
      },
    }),
  ],
  test: {
    globals: true,
    include: ['test/integration/**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage-integration',
      include: ['apps/api/src/**/*.ts', 'apps/background/src/**/*.ts', 'packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.int.test.ts', '**/*.d.ts', '**/index.ts', '**/types.d.ts'],
      // NOTE: V8 coverage instrumentation is not functional with @cloudflare/vitest-pool-workers
      // because the Cloudflare Workers sandbox does not expose node:inspector/promises.
      // Run `pnpm run test:integration` (without --coverage) for integration testing.
      // Coverage thresholds are omitted intentionally — they would always fail at 0%.
    },
    pool: cloudflarePool({
      wrangler: {
        configPath: './test/integration/wrangler.test.jsonc',
      },
    }),
  },
  ssr: {
    noExternal: ['hono', 'chanfana', '@mail-otter'],
  },
  resolve: {
    alias: [
      { find: '@mail-otter/background', replacement: backgroundSrcPath },
      { find: '@mail-otter/backend-data', replacement: backendDataSrcPath },
      { find: '@mail-otter/backend-errors', replacement: backendErrorsSrcPath },
      { find: '@mail-otter/backend-runtime', replacement: backendRuntimeSrcPath },
      { find: '@mail-otter/provider-clients', replacement: providerClientsSrcPath },
      { find: '@mail-otter/shared', replacement: sharedSrcPath },
      { find: /^@\//, replacement: `${apiSrcPath}/` },
    ],
  },
});
