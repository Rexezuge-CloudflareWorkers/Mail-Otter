# AGENTS.md

Guidance for agents working in Mail-Otter. `CLAUDE.md` is a symbolic link to this file. This is the global index — follow the links to scoped sub-guides before working in an area.

## Overview

Mail-Otter is a Cloudflare Worker API + Vite React SPA in a pnpm workspace (`@mail-otter/monorepo`, `packageManager: pnpm@11.2.2`).

- **Core**: Cloudflare Zero Trust on `/user/*` (JWT `cf-access-jwt-assertion`); provider webhooks under `/api/*` validate secrets and enqueue work; emails summarized via Workers AI with optional RAG (Vectorize) context indexing.
- **Actions**: AI proposes 8 structured action types confirmed via public callback or the management UI; `calendar.add_event` + `email.draft_reply` support snooze/schedule/auto-execute. See `docs/agents/features/email-actions/AGENTS.md`.
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

Plain `pnpm` is canonical (CI uses `pnpm/action-setup@v4` + `setup-node node 24`). No `source ~/.customrc`, no `volta run` prefix.

```bash
pnpm install
pnpm -r typecheck && pnpm run lint && pnpm run test:coverage && pnpm run test:integration
pnpm --filter @mail-otter/web build   # only web has a build script
pnpm --filter @mail-otter/web dev     # vite dev server
pnpm run typegen   # after changing wrangler bindings
pnpm exec wrangler dev
pnpm exec wrangler deploy
```

## Import Direction

```
Layer 0: shared, backend-errors          — zero @mail-otter/* deps
Layer 1: backend-runtime                 → layer 0 only
Layer 2: backend-data, provider-clients  → layer 0 only
Layer 3: backend-services                → layers 0–2 (not apps)
(no Layer 4 by design)
Layer 5: apps/background                 → layers 0–3 (provider-clients OK)
         apps/api                        → layers 0–3 + background (NOT provider-clients directly)
```

Enforced by ESLint `no-restricted-imports` in `eslint.config.mjs` (Layer 5 currently only blocks `apps/api → provider-clients`).

## Index

| Area | Guide |
|---|---|
| API worker, auth, routes | `apps/api/AGENTS.md` |
| Background worker, cron phases, task visibility | `apps/background/AGENTS.md` |
| Web SPA, frontend i18n, UI text conventions | `apps/web/AGENTS.md` |
| Provider clients, naming, Graph gotchas | `packages/provider-clients/AGENTS.md` |
| D1/DAO layer, provider-config rows | `packages/backend-data/AGENTS.md` |
| Business logic, service domain map | `packages/backend-services/AGENTS.md` |
| Bindings, wrangler, env vars | `docs/agents/runtime/AGENTS.md` |
| Tests, thresholds, mock patterns | `docs/agents/testing/AGENTS.md` |
| Email actions + calendar | `docs/agents/features/email-actions/AGENTS.md` |
| Processing rules | `docs/agents/features/processing-rules/AGENTS.md` |
| Sender allowlist | `docs/agents/features/sender-filters/AGENTS.md` |
| Attachment vision | `docs/agents/features/attachment-vision/AGENTS.md` |
| Scheduled digest | `docs/agents/features/digest/AGENTS.md` |
| Outbound integrations | `docs/agents/features/integrations/AGENTS.md` |
| Drive/OneDrive ingestion | `docs/agents/features/drive-ingestion/AGENTS.md` |
| Activity feed | `docs/agents/features/activity-feed/AGENTS.md` |
| AI email chat | `docs/agents/features/chat/AGENTS.md` |

## Keeping AGENTS.md Current

Update the scoped sub-guide (not this index) as part of any change that adds, removes, or renames:
- Routes → `apps/api/AGENTS.md`
- Cron tasks/phases → `apps/background/AGENTS.md`
- Web UI, locales, text conventions → `apps/web/AGENTS.md`
- Providers, Graph behavior → `packages/provider-clients/AGENTS.md`
- DAOs, provider-config rows → `packages/backend-data/AGENTS.md`
- Services → `packages/backend-services/AGENTS.md` (+ feature file if cross-cutting)
- Env vars, bindings → `docs/agents/runtime/AGENTS.md`
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
