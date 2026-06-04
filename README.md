# Mail-Otter

Mail-Otter is a Cloudflare Worker app that watches connected Gmail or Outlook inboxes, summarizes new messages with Workers AI, and posts a private self-addressed summary reply in the same thread.

Users bring their own OAuth app credentials. Gmail also requires a Google Pub/Sub topic and push subscription.

## Providers

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2` for personal Outlook.com, Hotmail, and Live accounts

## Cloudflare Bindings

- D1 database binding: `DB`
- Secrets Store secret: `AES_ENCRYPTION_KEY_SECRET`
- Workers AI binding: `AI`
- Vectorize index binding: `EMAIL_CONTEXT_INDEX`
- Workflow binding: `EMAIL_PROCESSING_WORKFLOW`
- Queue producer and consumer: `EMAIL_EVENTS_QUEUE`
- Cron trigger: every 10 minutes, for token refresh, context document pruning, and subscription renewal

Copy `apps/api/wrangler.template.jsonc` to `wrangler.jsonc` and fill in the D1 database id, secret store id, and routes.

Create the Vectorize index before deploy:

```bash
source ~/.customrc
volta run npx wrangler vectorize create mail-otter-email-context --dimensions=768 --metric=cosine
```

The management UI lets users enable or disable context indexing per connected application, set a per-application document limit, inspect indexed documents, and delete all indexed documents for one application. A global ceiling (`MAX_CONTEXT_DOCUMENTS_PER_APPLICATION`, default 10 000) caps the limit across all applications; the cron task automatically prunes oldest documents when an application exceeds its effective limit.

## OAuth Setup

Mail-Otter generates one redirect URI per connected mailbox:

```text
https://your-domain.example/api/oauth2/callback/{applicationId}
```

Add that URI to the user-owned OAuth app, then start OAuth2 from the Mail-Otter UI.

Required Gmail scopes:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

Required Microsoft delegated permissions:

```text
Mail.Read
Mail.ReadWrite
Mail.Send
offline_access
```

## Gmail Push Setup

For Gmail, create a Pub/Sub topic in the same Google Cloud project as the OAuth client. Grant publish permission to:

```text
gmail-api-push@system.gserviceaccount.com
```

Use a topic name like:

```text
projects/{projectId}/topics/{topicName}
```

After OAuth succeeds, start the watch in Mail-Otter. The UI shows a one-time webhook URL containing a token. Configure the Pub/Sub push subscription to deliver to that URL.

## Optional Environment Variables

Set these in `wrangler.jsonc` under `vars` to override defaults:

| Variable                                | Default                   | Description                                                                                                  |
| --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MAX_APPLICATIONS_PER_USER`             | `99`                      | Hard limit on connected applications per user                                                                |
| `MAX_CONTEXT_DOCUMENTS_PER_APPLICATION` | `10000`                   | Global ceiling on indexed documents per application                                                          |
| `MAX_EMAIL_BODY_CHARS`                  | `12000`                   | Characters of email body sent to AI for summarization                                                        |
| `AI_SUMMARY_MODEL`                      | `@cf/openai/gpt-oss-120b` | Workers AI model for email summarization                                                                     |
| `AI_SUMMARY_FALLBACK_MODEL`             | `@cf/openai/gpt-oss-20b`  | Workers AI summary model used after the daily neuron fallback threshold is reached                           |
| `AI_DAILY_NEURON_FALLBACK_THRESHOLD`    | `9000`                    | Estimated UTC daily Workers AI neuron usage where summaries switch to the fallback model; set `0` to disable |
| `AI_EMBEDDING_MODEL`                    | `@cf/baai/bge-m3`         | Workers AI model for context embeddings                                                                      |

## Continuous Deployment Variables

GitHub Actions deployments can patch Worker `vars` without replacing the whole Wrangler configuration. Set the repository variable `WRANGLER_VARS_PATCH_JSON` to a JSON object of string values. The deployment merges it into top-level `vars` after loading `WRANGLER_JSONC` or `apps/api/wrangler.template.jsonc`.

```json
{
  "POLICY_AUD": "your-cloudflare-zero-trust-application-aud",
  "TEAM_DOMAIN": "https://your-cloudflare-zero-trust-team-domain.cloudflareaccess.com",
  "SERVE_SPA_FROM_WORKER": "true"
}
```

Do not put secrets in `WRANGLER_VARS_PATCH_JSON`; use GitHub secrets, Wrangler secrets, or Cloudflare Secrets Store for sensitive values.

## Commands

```bash
source ~/.customrc
volta run pnpm install
volta run pnpm run typecheck
volta run pnpm run test
volta run pnpm run build
```
