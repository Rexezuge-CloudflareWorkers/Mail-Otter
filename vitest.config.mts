import { defineUnitVitestConfig } from '@rexezuge/tooling/vitest';

/**
 * The unit suite's resolver and coverage floors.
 *
 * This was a hand-written alias table listing every workspace package and every
 * `cloudflare:*` mock by path. `defineUnitVitestConfig` derives both from the
 * package names, so a new workspace package needs no entry here — the failure
 * mode before was an alias silently missing and the suite resolving the
 * *published* package instead of the source, which typechecks and then tests the
 * wrong copy.
 *
 * The coverage floors are the one thing that stays explicit. They are this
 * repo's number, and the factory deliberately sets none by default: a shared
 * default would be a number no repo chose.
 */
export default defineUnitVitestConfig({
  scope: '@mail-otter',
  /**
   * The packages under `packages/`, plus `background`, which the factory
   * resolves to `apps/background/src` because it is an app rather than a
   * package.
   *
   * `api` is absent because `apps/api` is reached through the `@/` alias rather
   * than by package name.
   */
  packages: ['shared', 'backend-data', 'backend-runtime', 'backend-services', 'provider-clients', 'background'],
  root: new URL('.', import.meta.url).href,
  thresholds: {
    statements: 88.5,
    branches: 76.5,
    functions: 90.5,
    lines: 89.5,
  },
});
