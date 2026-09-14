# AGENTS.md

Guidance for agents working in Mail-Otter. `CLAUDE.md` is a symbolic link to this file. This is the global index — follow the links to scoped sub-guides before working in an area.

## Overview

Mail-Otter is a Cloudflare Workers API + background cron/queue/workflow/Durable Objects system + Vite React SPA in a pnpm workspace (`@mail-otter/monorepo`, `packageManager: pnpm@11.2.2`).

- **Core**: `apps/api` serves Hono/Chanfana routes and the SPA shell; `apps/background` runs the 2-phase cron (`CronTasksWorker` via `TaskRegistry`), queue consumer, email workflow, and token-refresh DO (see `apps/background/AGENTS.md`). Cloudflare Zero Trust on `/user/*` (JWT `cf-access-jwt-assertion`); provider webhooks under `/api/*` validate secrets and enqueue work; emails summarized via Workers AI with optional RAG (Vectorize) context indexing.
- **Actions**: AI proposes 8 structured action types confirmed via public callback or the management UI; snooze works on any `pending` action while schedule/auto-execute are restricted to `calendar.add_event` + `email.draft_reply` (30-day cap + expiry buffers). See `docs/agents/features/email-actions/AGENTS.md`.
- **Composition**: per-request DI via `createRequestScope(env)` + `scope.get(Tokens.X)` from `@mail-otter/backend-services/composition` (`Container` + `AppConfiguration` in `@mail-otter/backend-runtime/di+config`); never `new XService(env)` in new code. See `docs/agents/runtime/AGENTS.md`.
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
pnpm run lint   # eslint --fix --quiet . (auto-fixes)
pnpm run build  # pnpm -r build; only @mail-otter/web has a build script
pnpm --filter @mail-otter/web dev     # vite dev server
pnpm run typegen   # after changing wrangler bindings (uses apps/api/wrangler.template.jsonc)
pnpm exec wrangler dev --config ./apps/api/wrangler.template.jsonc
pnpm exec wrangler deploy --config ./apps/api/wrangler.template.jsonc
```

Notes: `wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer, no committed `wrangler.jsonc` (see `docs/agents/runtime/AGENTS.md`). God-file guard (`scripts/check-god-files.mjs`, soft 300 / hard 400 LOC) is warn-only in CI (`continue-on-error`).

## Import Direction

```
Layer 0: shared, backend-errors          — zero @mail-otter/* deps
Layer 1: backend-runtime                 → layer 0 only
Layer 2: backend-data, provider-clients  → layer 0 only
Layer 3: backend-services                → layers 0–2 (not apps)
(no Layer 4 by design)
Layer 5: apps/background                 → layers 0–3 (provider-clients OK; convention-only, no dedicated lint block)
         apps/api                        → layers 0–3 + background (NOT provider-clients directly; NOT backend-data/dao except type-only)
```

Enforced by ESLint `no-restricted-imports` in `eslint.config.mjs`: `apps/api` blocks `→ @mail-otter/provider-clients` (all imports) and `→ @mail-otter/backend-data/dao` (`allowTypeImports: true`). `apps/api → apps/background` re-export is allowed (`src/index.ts` re-exports `CronTasksWorker`, `EmailProcessingWorkflow`, `OAuth2TokenRefreshWorker` for bindings).

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

## Commit Policy

Always commit changes after completing work unless explicitly told not to.

## Git Commit Messages

Format: `<TYPE>[optional scope]: <description>`

- Type in UPPERCASE: `FIX`, `FEAT`, `DOCS`, `STYLE`, `REFACTOR`, `TEST`, `BUILD`, `CHORE`, `CI`, `PERF`.
- Scope in lowercase: `FEAT(runtime): Add Scheduled Job State`.
- Description: Title Case words — `DOCS: Latest Agents Context Reflection`.
- When committing from `main`, first create a branch: `type/description` or `type/scope/description` in kebab-case (e.g. `feat/bootstrap/bootstrap-jqanywhere-v0.1-framework`).
- Always include a Markdown body separated from the subject by a blank line.
- Breaking changes: `!` after type/scope, or `BREAKING CHANGE: <description>` footer.

```text
<TYPE>[optional scope]: <description>

[Markdown body]

[optional footers]
```
