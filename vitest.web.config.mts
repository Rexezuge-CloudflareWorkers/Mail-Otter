import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

/**
 * Unit tests for the SPA.
 *
 * `apps/web` was previously untested: the root `vitest.config.mts` only
 * collects from `test/**`, and its coverage `include` covers `apps/api`,
 * `apps/background`, and `packages/**` — so roughly 8,400 lines of frontend
 * code had no test harness at all. This config gives the SPA its own suite
 * without disturbing the server-side one.
 *
 * Scope is deliberately the dependency-free layer: `lib/`, `services/`, and
 * locale key parity. Components are covered later via React Testing Library,
 * which needs a jsdom environment and per-view fixtures.
 */
const webSrc = fileURLToPath(new URL('apps/web/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['apps/web/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage-web',
      include: ['apps/web/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/generated/**', '**/main.tsx', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: [{ find: /^@\//, replacement: `${webSrc}/` }],
  },
});
