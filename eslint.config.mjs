import { defineRepoLintConfig } from '@rexezuge/tooling/eslint';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The repo's lint rules are `@rexezuge/tooling`'s.
 *
 * This file was 327 lines of hand-maintained config. `defineRepoLintConfig` is
 * the converged table shared by the nine-repo family, so the layer boundaries
 * here stop being a second copy that can disagree with the other eight: a rule
 * tightened in the kit arrives on the next version bump rather than in a
 * hand-edit nobody would notice missing.
 *
 * ## What this gained, not just what it lost
 *
 * The kit's table names three boundaries this file did not enforce at all, and
 * all three were violations waiting to happen — each is a convention today,
 * stated in `AGENTS.md` and checked by nothing:
 *
 * - **`apps/background` must not import `apps/api`.** The old file documented
 *   this as "convention-only, no dedicated lint block".
 * - **`apps/web` must not import `@mail-otter/*` at all.** A backend package
 *   imported by the SPA typechecks and then fails at bundle time, with the error
 *   pointing at the bundler rather than at the boundary that caused it.
 * - **`apps/api` must not import `backend-data` values**, not just DAOs. The old
 *   rule banned `@mail-otter/backend-data/dao` and left the package's other
 *   subpaths open; the kit bans the package and keeps `allowTypeImports`, so
 *   `apps/api` still types its filters against DAO shapes.
 *
 * The kit also adds browser globals for `apps/web` rather than leaving that
 * package linted under Node globals only, and drops the silent
 * `unicorn/no-useless-undefined` exemption that 35 call sites were relying on.
 */
export default tseslint.config(
  defineRepoLintConfig({
    scope: '@mail-otter',
  }),

  /**
   * React Hooks, for the SPA.
   *
   * The kit deliberately does not ship this plugin — it would take the kit out
   * of zero-dependency, and the rule set belongs to the app that has JSX. Its
   * README shows these four lines for exactly this case. Without them the SPA
   * loses rules-of-hooks enforcement *and* every existing
   * `eslint-disable-next-line react-hooks/exhaustive-deps` comment in the tree
   * becomes a hard error, because ESLint rejects a disable comment naming a rule
   * that was never defined.
   */
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },

  /**
   * `apps/web/tsconfig.json` targets ES2020.
   *
   * `Array#at` and `String#replaceAll` ship in every browser the SPA supports
   * but are absent from that package's *types* under an ES2020 lib, so the
   * kit's base table — which assumes a modern lib — demands forms this package
   * cannot compile. Prefer the index form here.
   */
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'unicorn/prefer-at': 'off',
      'unicorn/prefer-string-replace-all': 'off',
    },
  },

  /**
   * Test-file policy the kit's narrower `TEST_RULES` table does not carry.
   *
   * Every entry here was already a local override in the previous version of
   * this file, with the reason it existed. They are repo policy rather than
   * family policy, so they stay here rather than being pushed into the kit and
   * imposed on eight repos that did not ask for them.
   *
   * They are also what makes the suite readable. `sonarjs/parameterized-tests`
   * fires on three sibling `it()` blocks that differ by one argument each, and
   * converting them to `it.each` replaces a diff that reads as a behavioural
   * change with one that reads as a table.
   */
  {
    files: ['test/**/*.{ts,tsx,mts,cts}', '**/*.test.{ts,tsx,mts,cts}', '**/*.spec.{ts,tsx,mts,cts}'],
    rules: {
      // `it.each` versus explicit `for...of` is a style choice, and the
      // assertion text is often clearer written out.
      'sonarjs/parameterized-tests': 'off',
      // A deliberate `undefined` argument is how a test exercises a
      // default-parameter branch, which is the whole point of the call.
      'sonarjs/no-undefined-argument': 'off',
      // `Array.from({ length: n }, () => value)` is the idiomatic fixture
      // builder, and reads better than `new Array(n).fill(value)` for a
      // per-index value.
      'unicorn/no-array-from-fill': 'off',
      // An explicit `continue` states the loop's intent; `if (!(skip)) { … }`
      // inverts the condition and makes the body harder to read.
      'unicorn/prefer-continue': 'off',
      // Fires on the action type constant `manual.todo`, which is a domain
      // value rather than a task marker.
      'sonarjs/todo-tag': 'off',
      // Fixture data and ID generation in tests are not security-relevant.
      'sonarjs/pseudo-random': 'off',
    },
  },
);