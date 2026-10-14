# AGENTS.md

Guidance for agents working in Mail-Otter. `CLAUDE.md` is a symbolic link to this file. This is the global index — follow the links to scoped sub-guides before working in an area.

## Overview

Mail-Otter is a Cloudflare Workers API + background cron/queue/workflow/Durable Objects system + Vite React SPA in a pnpm workspace (`@mail-otter/monorepo`, `packageManager: pnpm@11.2.2`).

- **Core**: `apps/api` serves Hono/Chanfana routes and the SPA shell; `apps/background` runs the 2-phase cron (`CronTasksWorker` via `TaskRegistry`), queue consumer, email workflow, and token-refresh DO (see `apps/background/AGENTS.md`). Cloudflare Zero Trust on `/user/*` (JWT `cf-access-jwt-assertion`); provider webhooks under `/api/*` validate secrets and enqueue work; emails summarized via Workers AI with optional RAG (Vectorize) context indexing.
- **Actions**: AI proposes 8 structured action types confirmed via public callback or the management UI; snooze works on any `pending` action while schedule/auto-execute are restricted to `calendar.add_event` + `email.draft_reply` (30-day cap + expiry buffers). See `docs/agents/features/email-actions/AGENTS.md`.
- **Composition**: per-request DI via `createRequestScope(env)` + `scope.get(Tokens.X)` from `@mail-otter/backend-services/composition` (`Container` + `AppConfiguration` in `@mail-otter/backend-runtime/di+config`); never `new XService(env)` in new code. See `docs/agents/runtime/AGENTS.md`.
  - `RequestScopeEnv` declares every binding the scoped services require, and `AssertCoversKeys` in `requestScope.ts` checks that at compile time via the exported `SCOPE_ENV_COVERAGE` value (type aliases are lazy, so the tuple must be bound to something to be evaluated). Adding a required binding to a service fails typecheck until `RequestScopeEnv` is updated. Do not reintroduce `env as never` at the construction sites.
- **Identity**: `users.id` is the stable account key; `users.email` is a **frozen anchor** (never updated) and `users.current_email` the mutable sign-in address, with `user_emails` as the address registry. Routes pass an `AccountIdentity` to authorizing services, not a bare address. Address changes are an ops operation (`scripts/change-email.ts`). See `docs/agents/runtime/AGENTS.md`.
- **Providers**: `google-gmail`, `microsoft-outlook`, `fastmail-jmap`, `yahoo-mail`, `custom-imap`, `apple-icloud` (`oauth2` and/or `imap-password` per matrix). See `packages/provider-clients/AGENTS.md`.
- **Features**: sender allowlist, 20 processing rules per mailbox, daily digest, outbound webhooks, Drive/OneDrive RAG ingestion, activity feed, AI chat, 12-locale i18n. See Index below.

## Cloudflare Documentation

**STOP.** APIs, limits, and behavior change frequently. Before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, Workers AI, or Agents SDK task, retrieve current official docs.

- Workers: https://developers.cloudflare.com/workers/
- Cloudflare MCP: https://docs.mcp.cloudflare.com/mcp
- Node.js compat: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Worker errors: https://developers.cloudflare.com/workers/observability/errors/
- Limits: retrieve each product's `/platform/limits/` page (e.g. `/workers/platform/limits/`)
- Product refs: `/workers/`, `/kv/`, `/r2/`, `/d1/`, `/durable-objects/`, `/queues/`, `/vectorize/`, `/workers-ai/`, `/agents/`
- Error 1102 = CPU/memory exceeded; see `/workers/platform/limits/`.
- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/

## Commands

Plain `pnpm` is canonical (CI uses the `.github/actions/setup-env` composite: `pnpm/action-setup@v4` + `actions/setup-node@v4` Node 24 + `pnpm install`). No `source ~/.customrc`, no `volta run` prefix.

```bash
pnpm install
pnpm -r typecheck && pnpm run lint && node scripts/check-god-files.mjs && pnpm run test:coverage && pnpm run test:integration
pnpm run lint       # check-only lint of every workspace + test/ (CI gate)
pnpm run lint:fix   # eslint --fix, same targets
pnpm run format:check  # prettier --check (also enforced via lint)
pnpm run build  # pnpm -r build; only @mail-otter/web has a build script
pnpm --filter @mail-otter/web dev     # vite dev server
pnpm run typegen   # after changing wrangler bindings (uses apps/api/wrangler.template.jsonc)
pnpm exec wrangler dev --config ./apps/api/wrangler.template.jsonc
pnpm exec wrangler deploy --config ./apps/api/wrangler.template.jsonc
```

Notes: `wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer, no committed `wrangler.jsonc` (see `docs/agents/runtime/AGENTS.md`). God-file guard (`scripts/check-god-files.mjs`, soft 300 / hard 400 LOC) is warn-only in CI (`continue-on-error`).

Lint runs via `scripts/lint-workspaces.mjs`, which invokes ESLint once per workspace package plus `test/` and root configs. A single `eslint .` builds every tsconfig program at once and OOMs on small machines (~1 GB).

`eslint.config.mjs` is `@rexezuge/tooling`'s `defineRepoLintConfig` plus three appended blocks, each with its reason: the React Hooks plugin (the kit stays zero-dependency and documents that the consumer appends it — without it the SPA loses rules-of-hooks enforcement **and** every existing `eslint-disable-next-line react-hooks/*` comment becomes a hard error), the ES2020 relaxations for `apps/web` (`Array#at` and `String#replaceAll` ship in every browser the SPA supports but are absent from that package's ES2020 lib types, so the kit's base table demands forms that cannot compile), and the test-file policy the kit's narrower `TEST_RULES` does not carry. Prettier scope is controlled by `.prettierignore`.

## Import Direction

```
Layer 0: shared                          — zero @mail-otter/* deps
Layer 1: backend-runtime                 → layer 0 only
Layer 2: backend-data, provider-clients  → layer 0 only
Layer 3: backend-services                → layers 0–2 (not apps)
(no Layer 4 by design)
Layer 5: apps/background                 → layers 0–3 (provider-clients OK)
         apps/api                        → layers 0–3 + background (NOT provider-clients, NOT backend-data values except type-only)
         apps/web                        → no @mail-otter/* imports at all
```

**There is no `backend-errors` package.** The error taxonomy is `@rexezuge/errors`
and is imported by that name everywhere.

The whole table is enforced by ESLint `no-restricted-imports`, from
`@rexezuge/tooling`'s `defineRepoLintConfig` rather than a local copy — see
`eslint.config.mjs`. That factory is the source for all nine family repos, so a
boundary tightened there arrives here on the next version bump rather than in a
hand-edit nobody would notice missing. It enforces three boundaries this repo
previously documented but did not gate: `apps/background` must not import
`apps/api`; `apps/web` must not import `@mail-otter/*` at all (a backend package
reached from the SPA typechecks and then fails at bundle time, with the error
pointing at the bundler); and `apps/api` must not import `backend-data` values
rather than only DAOs, with `allowTypeImports` so it still types filters against
DAO shapes.

`apps/api → apps/background` re-export is allowed (`src/index.ts` re-exports
`CronTasksWorker`, `EmailProcessingWorkflow`, `OAuth2TokenRefreshWorker` for
bindings).

## The Kit

`@rexezuge/*` is the framework kernel, consumed at a single pinned version with
`overrides` in `pnpm-workspace.yaml` forcing **one copy of every package**. That
override is not tidiness: the kit versions in lockstep but a publish does not
reach the registry atomically, so mid-window `@rexezuge/http@1.7.2` can depend on
`@rexezuge/errors@1.7.1` while this repo asks for 1.7.2 — and two copies of a
package that identifies its types with `instanceof` is a silent correctness bug,
not a version warning. A `DatabaseError` thrown inside `@rexezuge/d1` stops being
a `ServiceError` at this repo's boundary, every catch that narrows on the
taxonomy falls through to a masked 500, and nothing in the failure names a
package.

Bumping the kit is one line in `pnpm-workspace.yaml`'s `overrides` plus the eight
manifests.

| Package              | Replaces / provides                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@rexezuge/errors`   | the error taxonomy; `toErrorResponse` masks 5xx messages and `toServiceError` is the catch-boundary idiom      |
| `@rexezuge/shared`   | `TimestampUtil`, `LocaleUtil`, `TimeZoneUtil`, `Cursor`, `Result`, `BaseDAO` cursor helpers                    |
| `@rexezuge/d1`       | `BaseDAO`, sql-first (`run/first/all(sql, [args])`), `isMissingSchemaError`, cursor codec                      |
| `@rexezuge/runtime`  | worker bases (`AbstractEntrypointWorker`/`WorkflowWorker`/`QueueWorker`/`DurableObjectWorker`), DI `Container` |
| `@rexezuge/identity` | `UserEmailDAO`, `accountLookup`, `UserIdentityService`, `UserDAO`'s username handle                            |
| `@rexezuge/http`     | `errorBody`/`toServiceError`, `accessAuth`, `securityHeaders`, `rateLimit`                                     |
| `@rexezuge/tooling`  | `eslint.config.mjs`, `vitest.config.mts`, `vitest.web.config.mts`, the Vite SPA-shell plugin                   |
| `@rexezuge/web`      | SPA `Unauthorized`, `NoticeBar`, `useNotice`                                                                   |

**Not adopted, deliberately.** `preferred_language` stays: it is a user-facing
setting wired through `PUT /user/me`, the SPA's language selector and
`ChatService`, so dropping it to match the kit's `users` table would be a product
regression. `UserDAO` is therefore a _subclass_ of the kit's rather than a
re-export — the escape hatch the kit's own migration table describes.
`IScheduledTask` also stays local; see `apps/background/AGENTS.md`.

`@rexezuge/*` must stay inside Vite's pipeline (`resolve.noExternal` in
`vitest.config.mts`): the kit's worker bases `extend DurableObject` from
`cloudflare:workers`, a specifier that only exists inside a worker, so
externalized Node sees the real protocol instead of the test alias for it.

## Index

| Area                                             | Guide                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| API worker, auth, routes                         | `apps/api/AGENTS.md`                                                                                              |
| Background worker, cron phases, task visibility  | `apps/background/AGENTS.md`                                                                                       |
| Web SPA, frontend i18n, UI text conventions      | `apps/web/AGENTS.md`                                                                                              |
| Provider clients, naming, Graph gotchas          | `packages/provider-clients/AGENTS.md`                                                                             |
| D1/DAO layer, provider-config rows               | `packages/backend-data/AGENTS.md`                                                                                 |
| Business logic, service domain map               | `packages/backend-services/AGENTS.md`                                                                             |
| Bindings, wrangler, env vars                     | `docs/agents/runtime/AGENTS.md`                                                                                   |
| DI composition, AppConfiguration, request scopes | `docs/agents/runtime/AGENTS.md` (§ Dependency injection) + `packages/backend-services/AGENTS.md` (`composition/`) |
| Token-adjacent logging, secret redaction         | `apps/background/AGENTS.md` (CodeQL `js/clear-text-logging`; static messages only)                                |
| Tests, thresholds, mock patterns                 | `docs/agents/testing/AGENTS.md`                                                                                   |
| Email actions + calendar                         | `docs/agents/features/email-actions/AGENTS.md`                                                                    |
| Processing rules                                 | `docs/agents/features/processing-rules/AGENTS.md`                                                                 |
| Sender allowlist                                 | `docs/agents/features/sender-filters/AGENTS.md`                                                                   |
| Attachment vision                                | `docs/agents/features/attachment-vision/AGENTS.md`                                                                |
| Scheduled digest                                 | `docs/agents/features/digest/AGENTS.md`                                                                           |
| Outbound integrations                            | `docs/agents/features/integrations/AGENTS.md`                                                                     |
| Drive/OneDrive ingestion                         | `docs/agents/features/drive-ingestion/AGENTS.md`                                                                  |
| Activity feed                                    | `docs/agents/features/activity-feed/AGENTS.md`                                                                    |
| AI email chat                                    | `docs/agents/features/chat/AGENTS.md`                                                                             |

## Keeping AGENTS.md Current

Update the scoped sub-guide as part of any change that adds, removes, or renames (update this index only when adding a new guide or top-level feature):

- Routes → `apps/api/AGENTS.md`
- Cron tasks/phases → `apps/background/AGENTS.md`
- Web UI, locales, text conventions → `apps/web/AGENTS.md`
- Providers, Graph behavior → `packages/provider-clients/AGENTS.md`
- DAOs, provider-config rows → `packages/backend-data/AGENTS.md`
- Services → `packages/backend-services/AGENTS.md` (+ feature file if cross-cutting)
- Env vars, bindings → `docs/agents/runtime/AGENTS.md`
- DI composition, `Tokens`, `AppConfiguration` → `docs/agents/runtime/AGENTS.md` + `packages/backend-services/AGENTS.md` (`composition/`)
- Token-adjacent logging, secret redaction → `apps/background/AGENTS.md`
- Tests, thresholds, mocks → `docs/agents/testing/AGENTS.md`
- Top-level features → `docs/agents/features/*/AGENTS.md` + one-line Overview touch-up here
