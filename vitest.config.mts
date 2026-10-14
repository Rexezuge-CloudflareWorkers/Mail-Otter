import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const apiSrcPath = fileURLToPath(new URL('apps/api/src', import.meta.url));
const backgroundSrcPath = fileURLToPath(new URL('apps/background/src', import.meta.url));
const backendDataSrcPath = fileURLToPath(new URL('packages/backend-data/src', import.meta.url));
const backendRuntimeSrcPath = fileURLToPath(new URL('packages/backend-runtime/src', import.meta.url));
const providerClientsSrcPath = fileURLToPath(new URL('packages/provider-clients/src', import.meta.url));
const sharedSrcPath = fileURLToPath(new URL('packages/shared/src', import.meta.url));
const backendServicesSrcPath = fileURLToPath(new URL('packages/backend-services/src', import.meta.url));
const cloudflareSocketsMockPath = fileURLToPath(new URL('test/mocks/cloudflare-sockets.ts', import.meta.url));
const cloudflareWorkersMockPath = fileURLToPath(new URL('test/mocks/cloudflare-workers.ts', import.meta.url));
const cloudflareWorkflowsMockPath = fileURLToPath(new URL('test/mocks/cloudflare-workflows.ts', import.meta.url));

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
      include: ['apps/api/src/**/*.ts', 'apps/background/src/**/*.ts', 'packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts', '**/types.d.ts', '**/model/**'],
      thresholds: {
        statements: 88.5,
        branches: 76.5,
        functions: 90.5,
        lines: 89.5,
      },
    },
  },
  resolve: {
    alias: [
      { find: '@mail-otter/background', replacement: backgroundSrcPath },
      { find: '@mail-otter/backend-data', replacement: backendDataSrcPath },
      { find: '@mail-otter/backend-runtime', replacement: backendRuntimeSrcPath },
      { find: '@mail-otter/backend-services', replacement: backendServicesSrcPath },
      { find: '@mail-otter/provider-clients', replacement: providerClientsSrcPath },
      { find: '@mail-otter/shared', replacement: sharedSrcPath },
      { find: 'cloudflare:sockets', replacement: cloudflareSocketsMockPath },
      { find: 'cloudflare:workers', replacement: cloudflareWorkersMockPath },
      { find: 'cloudflare:workflows', replacement: cloudflareWorkflowsMockPath },
      { find: /^@\//, replacement: `${apiSrcPath}/` },
    ],
    /**
     * `@rexezuge/*` must stay inside Vite's pipeline rather than being
     * externalized to Node.
     *
     * Two separate reasons, and the second only appeared once the kit was
     * installed from the registry rather than linked. The kit ships ESM `dist/`
     * with bundler-style extensionless imports that Node's resolver refuses; and
     * `@rexezuge/runtime`'s worker bases `extend DurableObject` /
     * `WorkflowEntrypoint` from `cloudflare:workers`, a specifier that only
     * exists inside a worker. Externalized, Node sees the real `cloudflare:`
     * protocol instead of the `cloudflare:workers` alias above and every suite
     * that reaches the composition root dies with "Only URLs with a scheme in
     * file, data, and node are supported".
     *
     * Same constant as `@rexezuge/tooling`'s `KIT_NO_EXTERNAL`.
     */
    noExternal: [/(^|[/\\])@rexezuge\//],
  },
});
