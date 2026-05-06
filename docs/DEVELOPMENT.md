# Mail-Otter Development

## Commands

```bash
source ~/.customrc
volta run pnpm install
volta run pnpm run dev
volta run pnpm run typecheck
volta run pnpm run test
volta run pnpm run build
volta run pnpm run cf-typegen
```

## Project Layout

- `apps/api/`: Cloudflare Worker API, webhook handlers, queue consumer, scheduled renewals.
- `apps/web/`: Vite React management UI for `/user`.
- `packages/shared/`: shared constants, models, schemas, and utilities.
- `migrations/`: D1 migrations; the final reset migration creates the Mail-Otter schema.
- `functions/[[path]].ts`: Pages-to-Worker proxy.

## Route Model

Cloudflare Zero Trust protects `/user/*`. Public provider endpoints are under `/api/*`.

Protected user routes:

- `GET /user/me`
- `GET /user/applications`
- `POST /user/application`
- `PUT /user/application`
- `DELETE /user/application`
- `PUT /user/application/context`
- `POST /user/application/context/delete-documents`
- `GET /user/application/context/documents`
- `GET /user/application/context/deletions`
- `POST /user/application/oauth2/authorize`
- `POST /user/application/watch`
- `POST /user/application/stop`

Public routes:

- `GET /api/oauth2/callback/:applicationId`
- `POST /api/webhooks/gmail/:applicationId`
- `GET|POST /api/webhooks/outlook/:applicationId`
- `GET|POST /api/webhooks/outlook/lifecycle/:applicationId`

## Processing

Webhook routes validate provider secrets or client state, enqueue lightweight jobs, and acknowledge quickly. The queue consumer dispatches an `EmailProcessingWorkflow` instance for each job. The workflow refreshes provider access tokens, fetches the new message, deduplicates by provider message id, retrieves per-user Vectorize context from enabled applications, calls Workers AI, sends a self-addressed summary reply in the original thread, and stores the new document in Vectorize when that application has indexing enabled.

## Configuration

`apps/api/wrangler.template.jsonc` includes:

- `DB`
- `AES_ENCRYPTION_KEY_SECRET`
- `AI`
- `EMAIL_CONTEXT_INDEX`
- `EMAIL_PROCESSING_WORKFLOW`
- `EMAIL_EVENTS_QUEUE`
- hourly cron
- `PUBLIC_BASE_URL`
- `AI_SUMMARY_MODEL`
- `AI_EMBEDDING_MODEL`
- `MAX_CONTEXT_MEMORY_CHARS`
- `MAX_RAG_CONTEXT_CHARS`
- `RAG_TOP_K`
- `RAG_VECTOR_QUERY_TOP_K`
- provider renewal windows
