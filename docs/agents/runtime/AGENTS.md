# Mail-Otter — Runtime And Configuration

Scope: Wrangler bindings, build output, env vars. Parent index: `../../../AGENTS.md`.

- Root package `@mail-otter/monorepo`, pnpm workspaces (`apps/*`, `packages/*`).
- `apps/web/vite.config.ts` proxies `/api` → `http://localhost:8787` in dev; `closeBundle` embeds `dist/index.html` into `apps/api/src/generated/spa-shell.ts` (`SPA_HTML`) on build.
- `apps/api/wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer; no committed `wrangler.jsonc`.
- The Worker serves the SPA only from its `/user/*` catch-all (`MailOtterWorker`: non-`/user/` paths return 404) so API routes aren't intercepted by the assets handler.
- Worker bindings: D1 `DB`, KV `OAUTH2_TOKEN_CACHE`, Secrets Store `AES_ENCRYPTION_KEY_SECRET` / `ACTION_ENCRYPTION_KEY_SECRET` / `ACTION_SIGNING_SECRET`, AI `AI`, Vectorize `EMAIL_CONTEXT_INDEX`, Queue `EMAIL_EVENTS_QUEUE`, Workflow `EMAIL_PROCESSING_WORKFLOW`, DOs `CRON_TASKS` / `OAUTH2_TOKEN_REFRESHERS`, cron `*/10 * * * *`.

## Migrations

Files in `migrations/` apply in filename order. Each file must be written so **every intermediate state is a valid schema**, because an interrupted batch must not leave the schema half-migrated.

**Deploy order:** apply the migration _before_ deploying the code that reads its new columns. Reads that select a new column fail with `no such column` on an un-migrated database. Rollback is a code rollback — migrations here only add columns and tables, and the pre-migration code ignores them.

### The frozen anchor (`users.email`)

Migration 0028 decoupled the email address from the user identifier. `users.email` became a **frozen anchor**: immutable, still the PRIMARY KEY, still the target of every legacy `FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE`, and still the input to the Vectorize namespace.

Repointing those foreign keys at a new `users.id` is **not possible on D1**: it honours neither `PRAGMA foreign_keys = off` nor `PRAGMA legacy_alter_table = on`, `defer_foreign_keys` does not suppress `ON DELETE CASCADE`, and SQLite rewrites a child's FK clause when the parent is renamed. A referenced table can only be dropped without cascading if nothing points at it — which is exactly the thing being changed. So the migration is purely additive and nothing had to move.

**Never `UPDATE users.email`.** Two independent reasons, either one sufficient:

1. Three tables cascade out of it, so rewriting it deletes the user's connected applications, context documents and deletion history.
2. `EmailContextUtil.getUserVectorNamespace` derives the Vectorize namespace as `u_` + `sha256(email)[0:62], and that value is persisted in `application_context_documents.vector_namespace` _and_ stamped into every existing vector. Moving it orphans the account's entire RAG corpus and AI chat history — silently, with no error, just empty results.

Every `getUserVectorNamespace` call site must therefore be fed the **anchor** (`application.userEmail`, or `identity.anchorEmail`), never the account's current address. `test/integration/api/UserIdentityUpgrade.int.test.ts` is the load-bearing guard for the whole change: it applies 0021–0027, seeds a row in every table reachable by a cascade, applies 0028, and asserts zero row loss, `PRAGMA foreign_key_check` empty, the three pre-existing FKs intact, and correct backfills.

### Ops

`pnpm exec tsx scripts/change-email.ts --db <name> (--account <email> | --id <usr_id>) --to <new> [--remote] [--dry-run]` — moves an account's sign-in address (claim → move → revoke, in that order, so the user is never locked out). Defaults to the **local** D1; `--remote` is opt-in. `--dry-run` is the only confirmation gate, so take a D1 backup out of band before running against `--remote`.

## Required vars (no defaults)

`POLICY_AUD`, `TEAM_DOMAIN` — Cloudflare Access JWT verification (`EmailValidationUtil`). No default; requests fail without them.

## Local-only (no default, not in `ConfigurationDefaults.ts`)

`DEV_AUTH_EMAIL` — bypasses Cloudflare Access locally.

## Optional vars (defaults in `ConfigurationDefaults.ts`)

| Group     | Vars (default)                                                                                                                                                                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI models | `AI_SUMMARY_MODEL` (`@cf/google/gemma-4-26b-a4b-it`), `AI_SUMMARY_FALLBACK_MODEL` (`@cf/openai/gpt-oss-20b`), `AI_EMBEDDING_MODEL` (`@cf/baai/bge-m3`)                                                                                                                                                                                  |
| AI quota  | `AI_DAILY_NEURON_FALLBACK_THRESHOLD` (`6000`), `AI_DAILY_NEURON_FREE_TIER_LIMIT` (`10000`), `AI_DAILY_USAGE_RETENTION_DAYS` (`90`)                                                                                                                                                                                                      |
| Email/RAG | `MAX_EMAIL_BODY_CHARS` (`12000`), `MAX_CONTEXT_MEMORY_CHARS` (`1800`), `MAX_RAG_CONTEXT_CHARS` (`6000`), `RAG_TOP_K` (`5`), `RAG_VECTOR_QUERY_TOP_K` (`50`), `MAX_CONTEXT_DOCUMENTS_PER_APPLICATION` (`1000`)                                                                                                                           |
| OAuth2    | `OAUTH2_STATE_EXPIRY_MINUTES` (`15`), `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS` (`900`), `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS` (`60`), `OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS` (`3600`), `OAUTH2_TOKEN_REFRESH_BATCH_SIZE` (`25`)                                                                                               |
| Renewal   | `GMAIL_WATCH_RENEWAL_WINDOW_HOURS` (`48`), `OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS` (`24`), `OUTLOOK_SUBSCRIPTION_TTL_DAYS` (`6`), `RENEWAL_RETRY_BASE_DELAY_SECONDS` (`300`), `RENEWAL_RETRY_MAX_DELAY_SECONDS` (`14400`)                                                                                                           |
| Retention | `PROCESSED_MESSAGE_RETENTION_DAYS` (`90`), `STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS` (`30`), `STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS` (`90`), `CONTEXT_DELETION_RUN_RETENTION_DAYS` (`90`), `CONTEXT_AUDIT_LOG_RETENTION_DAYS` (`90`), `INTEGRATION_DELIVERY_LOG_RETENTION_DAYS` (`30`), `BACKGROUND_TASK_RUN_RETENTION_DAYS` (`30`) |
| Actions   | `ACTION_CALLBACK_BASE_URL` (`""`), `ACTION_DEFAULT_EXPIRY_HOURS` (`168`), `ACTION_RETENTION_DAYS` (`90`)                                                                                                                                                                                                                                |
| Vision    | `ATTACHMENT_VISION_ENABLED` (`true`), `ATTACHMENT_VISION_MODEL` (`@cf/meta/llama-3.2-11b-vision-instruct`), `MAX_ATTACHMENT_SIZE_BYTES` (`2097152`), `MAX_ATTACHMENTS_PER_EMAIL` (`3`)                                                                                                                                                  |
| Drive     | `MAX_DRIVE_FILES_PER_SYNC` (`20`)                                                                                                                                                                                                                                                                                                       |
| Chat      | `CHAT_MAX_RESPONSE_TOKENS` (`1000`), `CHAT_VECTOR_QUERY_TOP_K` (`20`), `CHAT_CONTEXT_TOP_K` (`5`), `CHAT_MAX_HISTORY_MESSAGES` (`10`)                                                                                                                                                                                                   |
| Tracking  | `PACKAGE_TRACKING_API_KEY` (`""`), `FLIGHT_TRACKING_API_KEY` (`""`)                                                                                                                                                                                                                                                                     |
| Base URL  | `PUBLIC_BASE_URL` (`""`) — required for automatic recovery of deleted Outlook subscriptions                                                                                                                                                                                                                                             |
| Misc      | `DEBUG_MODE` (`false`), `MAX_APPLICATIONS_PER_USER` (`99`)                                                                                                                                                                                                                                                                              |

Add new env vars in `ConfigurationDefaults.ts` (+ `ConfigurationManager` getter), not inline.

## Dependency injection (`packages/backend-runtime/src/di/`)

- `AppConfiguration` (`backend-runtime/src/config/AppConfiguration.ts`) — injectable instance view over env parsing (captured env, one method per setting); `ConfigurationManager` statics remain as a thin backward-compatible facade. Prefer injecting `AppConfiguration` (or structural subsets) in new services; mock via constructor deps, not module mocks.

- `Container` — minimal Factory + Singleton DI container (`bind`/`bindValue`/`get`/`resolve`/`createChild`). Composition roots (API/background workers, tests) wire dependencies once; services declare constructor deps on interfaces.
- `createServiceContext(env, overrides?)` — single request-scoped `{ env, logger, clock }` replacing the 13+ bespoke `*Env` subsets. Prefer extending/deriving from `ServiceContext` over new `*Env` interfaces; never reintroduce `as` env casts in new code.
