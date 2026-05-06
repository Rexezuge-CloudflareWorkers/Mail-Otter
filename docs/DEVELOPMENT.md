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
- `POST /user/application/oauth2/authorize`
- `POST /user/application/watch`
- `POST /user/application/stop`

Public routes:

- `GET /api/oauth2/callback/:applicationId`
- `POST /api/webhooks/gmail/:applicationId`
- `GET|POST /api/webhooks/outlook/:applicationId`
- `GET|POST /api/webhooks/outlook/lifecycle/:applicationId`

## Processing

Webhook routes validate provider secrets or client state, enqueue lightweight jobs, and acknowledge quickly. Queue processing refreshes provider access tokens, fetches the new message, deduplicates by provider message id, calls Workers AI, and sends a self-addressed summary reply in the original thread.

## Configuration

`apps/api/wrangler.template.jsonc` includes:

- `DB`
- `AES_ENCRYPTION_KEY_SECRET`
- `AI`
- `EMAIL_EVENTS_QUEUE`
- hourly cron
- `PUBLIC_BASE_URL`
- `AI_SUMMARY_MODEL`
- provider renewal windows
