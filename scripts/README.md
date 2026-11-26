# scripts/

Repo tooling, grouped by who runs it. Every script is TypeScript, typechecked by `pnpm run typecheck:scripts` and format-checked by `pnpm run format:check`. The shared ESLint config ignores `scripts/**`, so lint is not a gate here — keep typecheck and formatting clean.

| Directory / location | Runs from                          | Purpose                                                                                               |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lib/`               | imported                           | Reusable helpers. No side effects on import.                                                          |
| `build/`             | build job / CI                     | Verifies the built SPA shell and its stylesheet still carry the kit's utilities.                      |
| `backup/`            | `backup-d1.yml`                    | One entrypoint per workflow step. See `../docs/db-backup-recovery.md`.                                |
| `migrations/`        | a human, or CI                     | The migration checksum lock: verify applied SQL has not changed.                                      |
| scripts/ root        | deploy job / human at a terminal   | Deploy entrypoints (`prepare-wrangler-config.ts`, `init-secrets.ts`) and ops (`change-email.ts`).      |

The SQL migrations themselves live in the repository-root `migrations/` directory — they are what `wrangler d1 migrations apply` reads. `scripts/migrations/` only checks their digests against `migrations/migrations.lock.json`.

## Entrypoint vs module convention

Followed across the sibling repos (`Mail-Meow`, `Durable-DAV`, `Durable-DAV-Router`), so `scripts/**` needs no ESLint rule overrides:

- An **entrypoint** starts with `#!`, runs at top level, and exports nothing. `unicorn/no-exports-in-scripts` fires only on files whose first line is `#!`, so keeping exports out of entrypoints is what lets these files be linted at all.
- A **module** has no `#!` and exports freely. Testable guards and shared helpers live here, and are imported by both the entrypoint and `test/`.

`prepare-wrangler-config.ts` at the scripts root is the deploy entrypoint: it materializes `wrangler.jsonc` and provisions its resources. `test/backup/` follows the same split, importing the backup modules rather than the entrypoints.

## lib/

| Module                     | Contents                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `wrangler-config/types.ts` | `CONFIG_PATH` and `DEFAULT_UUID`: the `wrangler.jsonc` location and the placeholder D1 id shared by deploy and backup. |
| `github-actions.ts`        | `setOutput`, `logError`, `fail`. No `@actions/*` dependency, so scripts stay runnable locally.                        |

`DEFAULT_UUID` is the single definition of the placeholder D1 id. The deploy entrypoint writes a real id over it and `backup/` refuses to export while it is still present, so the empty-database guard cannot drift from what provisioning emits.

## Running one locally

CI entrypoints are runnable from a local shell:

```bash
pnpm exec tsx scripts/backup/evaluate-destination-config.ts
pnpm exec tsx scripts/prepare-wrangler-config.ts
pnpm run validate:migrations
pnpm run verify:spa-shell
pnpm run verify:kit-css
```

The `tsx` entrypoints import sibling modules with extensionless relative paths, which Node's ESM resolver will not resolve; `node` entrypoints (`build/verify-*.ts`) use `.ts` extensions.

There is no committed `wrangler.jsonc`. `scripts/prepare-wrangler-config.ts` creates it, and the deploy and backup scripts expect it to exist.

## Adding a script

1. Put pure logic in a module next to the entrypoint, or in `lib/` if more than one script needs it.
2. Give the entrypoint a `#!` and no exports.
3. Cover the module with a test in `test/` (or `test/backup/` for the backup workflow).
4. Export nothing that only the entrypoint needs. If a test needs it, that is a signal the logic belongs in the module.
