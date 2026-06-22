import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const apiSrcPath = fileURLToPath(new URL('./apps/api/src', import.meta.url));
const backgroundSrcPath = fileURLToPath(new URL('./apps/background/src', import.meta.url));
const backendCoreSrcPath = fileURLToPath(new URL('./packages/backend-core/src', import.meta.url));
const backendDataSrcPath = fileURLToPath(new URL('./packages/backend-data/src', import.meta.url));
const backendErrorsSrcPath = fileURLToPath(new URL('./packages/backend-errors/src', import.meta.url));
const backendRuntimeSrcPath = fileURLToPath(new URL('./packages/backend-runtime/src', import.meta.url));
const providerClientsSrcPath = fileURLToPath(new URL('./packages/provider-clients/src', import.meta.url));
const sharedSrcPath = fileURLToPath(new URL('./packages/shared/src', import.meta.url));
const cloudflareWorkersMockPath = fileURLToPath(new URL('./test/mocks/cloudflare-workers.ts', import.meta.url));
const cloudflareWorkflowsMockPath = fileURLToPath(new URL('./test/mocks/cloudflare-workflows.ts', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: [
        'apps/api/src/**/*.ts',
        'apps/background/src/**/*.ts',
        'packages/**/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/types.d.ts',
        '**/model/**',
      ],
      thresholds: {
        statements: 72,
        branches: 55,
        functions: 81,
        lines: 74,
      },
    },
  },
  resolve: {
    alias: [
      { find: '@mail-otter/background', replacement: backgroundSrcPath },
      { find: '@mail-otter/backend-core', replacement: backendCoreSrcPath },
      { find: '@mail-otter/backend-data', replacement: backendDataSrcPath },
      { find: '@mail-otter/backend-errors', replacement: backendErrorsSrcPath },
      { find: '@mail-otter/backend-runtime', replacement: backendRuntimeSrcPath },
      { find: '@mail-otter/provider-clients', replacement: providerClientsSrcPath },
      { find: '@mail-otter/shared', replacement: sharedSrcPath },
      { find: 'cloudflare:workers', replacement: cloudflareWorkersMockPath },
      { find: 'cloudflare:workflows', replacement: cloudflareWorkflowsMockPath },
      { find: /^@\//, replacement: `${apiSrcPath}/` },
    ],
  },
});
