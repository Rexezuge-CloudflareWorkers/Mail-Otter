# Mail-Otter — Runtime And Configuration

Scope: Wrangler bindings, build output, env vars. Parent index: `../../../AGENTS.md`.

- Root package `@mail-otter/monorepo`, pnpm workspaces (`apps/*`, `packages/*`).
- `apps/web/vite.config.ts` proxies `/api` → `http://localhost:8787` in dev; `closeBundle` embeds `dist/index.html` into `apps/api/src/generated/spa-shell.ts` (`SPA_HTML`) on build.
- `apps/api/wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer; no committed `wrangler.jsonc`.
- The Worker serves the SPA only from its `/user/*` catch-all (`MailOtterWorker`: non-`/user/` paths return 404) so API routes aren't intercepted by the assets handler.
- Worker bindings: D1 `DB`, KV `OAUTH2_TOKEN_CACHE`, Secrets Store `AES_ENCRYPTION_KEY_SECRET` / `ACTION_ENCRYPTION_KEY_SECRET` / `ACTION_SIGNING_SECRET`, AI `AI`, Vectorize `EMAIL_CONTEXT_INDEX`, Queue `EMAIL_EVENTS_QUEUE`, Workflow `EMAIL_PROCESSING_WORKFLOW`, DOs `CRON_TASKS` / `OAUTH2_TOKEN_REFRESHERS`, cron `*/10 * * * *`.

## Required vars (no defaults)

`POLICY_AUD`, `TEAM_DOMAIN` — Cloudflare Access JWT verification (`EmailValidationUtil`). No default; requests fail without them.

## Local-only (no default, not in `ConfigurationDefaults.ts`)

`DEV_AUTH_EMAIL` — bypasses Cloudflare Access locally.

## Optional vars (defaults in `ConfigurationDefaults.ts`)

| Group | Vars (default) |
|---|---|
| AI models | `AI_SUMMARY_MODEL` (`@cf/google/gemma-4-26b-a4b-it`), `AI_SUMMARY_FALLBACK_MODEL` (`@cf/openai/gpt-oss-20b`), `AI_EMBEDDING_MODEL` (`@cf/baai/bge-m3`) |
| AI quota | `AI_DAILY_NEURON_FALLBACK_THRESHOLD` (`6000`), `AI_DAILY_NEURON_FREE_TIER_LIMIT` (`10000`), `AI_DAILY_USAGE_RETENTION_DAYS` (`90`) |
| Email/RAG | `MAX_EMAIL_BODY_CHARS` (`12000`), `MAX_CONTEXT_MEMORY_CHARS` (`1800`), `MAX_RAG_CONTEXT_CHARS` (`6000`), `RAG_TOP_K` (`5`), `RAG_VECTOR_QUERY_TOP_K` (`50`), `MAX_CONTEXT_DOCUMENTS_PER_APPLICATION` (`1000`) |
| OAuth2 | `OAUTH2_STATE_EXPIRY_MINUTES` (`15`), `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS` (`900`), `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS` (`60`), `OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS` (`3600`), `OAUTH2_TOKEN_REFRESH_BATCH_SIZE` (`25`) |
| Renewal | `GMAIL_WATCH_RENEWAL_WINDOW_HOURS` (`48`), `OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS` (`24`), `OUTLOOK_SUBSCRIPTION_TTL_DAYS` (`6`), `RENEWAL_RETRY_BASE_DELAY_SECONDS` (`300`), `RENEWAL_RETRY_MAX_DELAY_SECONDS` (`14400`) |
| Retention | `PROCESSED_MESSAGE_RETENTION_DAYS` (`90`), `STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS` (`30`), `STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS` (`90`), `CONTEXT_DELETION_RUN_RETENTION_DAYS` (`90`), `CONTEXT_AUDIT_LOG_RETENTION_DAYS` (`90`), `INTEGRATION_DELIVERY_LOG_RETENTION_DAYS` (`30`), `BACKGROUND_TASK_RUN_RETENTION_DAYS` (`30`) |
| Actions | `ACTION_CALLBACK_BASE_URL` (`""`), `ACTION_DEFAULT_EXPIRY_HOURS` (`168`), `ACTION_RETENTION_DAYS` (`90`) |
| Vision | `ATTACHMENT_VISION_ENABLED` (`true`), `ATTACHMENT_VISION_MODEL` (`@cf/meta/llama-3.2-11b-vision-instruct`), `MAX_ATTACHMENT_SIZE_BYTES` (`2097152`), `MAX_ATTACHMENTS_PER_EMAIL` (`3`) |
| Drive | `MAX_DRIVE_FILES_PER_SYNC` (`20`) |
| Chat | `CHAT_MAX_RESPONSE_TOKENS` (`1000`), `CHAT_VECTOR_QUERY_TOP_K` (`20`), `CHAT_CONTEXT_TOP_K` (`5`), `CHAT_MAX_HISTORY_MESSAGES` (`10`) |
| Tracking | `PACKAGE_TRACKING_API_KEY` (`""`), `FLIGHT_TRACKING_API_KEY` (`""`) |
| Base URL | `PUBLIC_BASE_URL` (`""`) — required for automatic recovery of deleted Outlook subscriptions |
| Misc | `DEBUG_MODE` (`false`), `MAX_APPLICATIONS_PER_USER` (`99`) |

Add new env vars in `ConfigurationDefaults.ts` (+ `ConfigurationManager` getter), not inline.

## Dependency injection (`packages/backend-runtime/src/di/`)

- `AppConfiguration` (`backend-runtime/src/config/AppConfiguration.ts`) — injectable instance view over env parsing (captured env, one method per setting); `ConfigurationManager` statics remain as a thin backward-compatible facade. Prefer injecting `AppConfiguration` (or structural subsets) in new services; mock via constructor deps, not module mocks.

- `Container` — minimal Factory + Singleton DI container (`bind`/`bindValue`/`get`/`resolve`/`createChild`). Composition roots (API/background workers, tests) wire dependencies once; services declare constructor deps on interfaces.
- `createServiceContext(env, overrides?)` — single request-scoped `{ env, logger, clock }` replacing the 13+ bespoke `*Env` subsets. Prefer extending/deriving from `ServiceContext` over new `*Env` interfaces; never reintroduce `as` env casts in new code.
