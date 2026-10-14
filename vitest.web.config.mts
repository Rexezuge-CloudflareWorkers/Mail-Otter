import { defineWebVitestConfig } from '@rexezuge/tooling/vitest-web';
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
 *
 * The `~/` alias and the jsdom environment are the kit's, so an SPA file
 * importing `~/lib/api` resolves the same way here as it does in `vite build`.
 * Before, the two harnesses each declared their own and could disagree — which
 * is a class of failure that only shows up as a test that passes and a bundle
 * that does not build.
 *
 * `scope` is omitted: the SPA has no workspace packages of its own, and the
 * `cloudflare:*` mocks are unreachable from `lib/` and `services/`.
 */
export default defineWebVitestConfig({
  plugins: [react()],
  root: new URL('.', import.meta.url).href,
  include: ['apps/web/**/*.test.{ts,tsx}'],
  reportsDirectory: './coverage-web',
});
