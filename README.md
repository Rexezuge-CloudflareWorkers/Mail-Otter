# Mail-Otter

Mail-Otter is a Cloudflare Worker app that watches connected Gmail or Outlook inboxes, summarizes new messages with Workers AI, and posts a private self-addressed summary reply in the same thread.

Users bring their own OAuth app credentials. Gmail also requires a Google Pub/Sub topic and push subscription.

Optional RAG context indexing lets the AI draw on recent indexed email content when generating summaries. From each summary the AI can suggest structured email actions — add a calendar event, draft a reply, open a link, or record a manual to-do — each with a public confirmation/denial callback flow that works from any email client, plus manual execution from the management UI.

Mailboxes carry their own time zone so calendar events stay correct, optional sender domain filters scope which senders are processed, and a usage analytics dashboard summarizes AI usage, processing outcomes, actions, and context indexing.

## Providers

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2` for personal Outlook.com, Hotmail, and Live accounts

## Cloudflare Bindings

- D1 database binding: `DB`
- KV namespace: `OAUTH2_TOKEN_CACHE`
- Workers AI binding: `AI`
- Vectorize index binding: `EMAIL_CONTEXT_INDEX`
- Workflow binding: `EMAIL_PROCESSING_WORKFLOW`
- Queue producer and consumer: `EMAIL_EVENTS_QUEUE`
- Durable Object: `CRON_TASKS`
- Durable Object: `OAUTH2_TOKEN_REFRESHERS`
- Secrets Store: `AES_ENCRYPTION_KEY_SECRET` (token encryption)
- Secrets Store: `ACTION_ENCRYPTION_KEY_SECRET` (action payload encryption)
- Secrets Store: `ACTION_SIGNING_SECRET` (action token signing)
- Cron trigger: every 10 minutes, for OAuth2 token refresh, context document pruning/embedding, processed message pruning, stale context document pruning, OAuth2 session pruning, context deletion run pruning, AI daily usage pruning, email action pruning, audit log pruning, and subscription renewal

Copy `apps/api/wrangler.template.jsonc` to `wrangler.jsonc` and fill in the D1 database id, KV namespace id, secret store ids, and routes.

Create the Vectorize index before deploy:

```bash
source ~/.customrc
volta run npx wrangler vectorize create mail-otter-email-context --dimensions=768 --metric=cosine
```

The management UI lets users enable or disable context indexing per connected application, set a per-application document limit, inspect indexed documents, view provider links to original emails, view audit logs, view deletion runs, and delete all indexed documents for one application. A global ceiling (`MAX_CONTEXT_DOCUMENTS_PER_APPLICATION`, default 1 000) caps the limit across all applications; the cron task automatically prunes oldest documents when an application exceeds its effective limit.

## Email Actions

When processing an email, the AI can generate one or more suggested actions. Each action has a type and a typed payload:

- `calendar.add_event` — add an event to the connected calendar (requires the optional Calendar feature; see below)
- `email.draft_reply` — prepare a draft reply
- `external.open_link` — open a relevant link
- `manual.todo` — record a manual to-do

Each action gets an encrypted and signed callback URL that is posted in the summary reply:

```text
https://your-domain.example/api/actions/{actionId}
https://your-domain.example/api/actions/{actionId}/execute
```

These routes are publicly accessible because email clients render the links. Security relies on `ACTION_ENCRYPTION_KEY_SECRET` (AES-GCM encryption of the action payload) and `ACTION_SIGNING_SECRET` (HMAC signing of the action token).

Users can also view, manually execute, and track execution history of actions via the management UI.

## Calendar Feature And Time Zones

`calendar.add_event` actions require the optional **Calendar** feature, which is enabled per connected application in the management UI. Enabling it requests additional OAuth scopes (`calendar.events` for Gmail, `Calendars.ReadWrite` for Outlook), so the mailbox must be re-authorized after enabling.

Each connected mailbox has its own time zone (defaulting to `UTC`). Calendar events and event-facing dates in summaries are rendered in the mailbox's configured zone, so they stay correct regardless of where the Worker runs.

## Sender Domain Filters

Each connected application can optionally define sender domain filters with include and exclude rules (up to 100 each). With no include rules, all senders are processed except those excluded; with include rules, only matching senders are processed. Configure filters in the management UI.

## Analytics

The management UI includes an analytics dashboard (`GET /user/analytics`) summarizing Workers AI usage (estimated neurons and request counts over time), processing outcomes, email action counts, and context indexing — overall or scoped to a single application, over a selectable number of days.

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

Mail-Otter requests scopes dynamically based on the features enabled for each application. Enabling the optional Calendar feature additionally requests `https://www.googleapis.com/auth/calendar.events` (Gmail) or `Calendars.ReadWrite` (Microsoft); re-authorize the mailbox after changing enabled features.

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

## Outlook Watch

For Outlook, the watch is started automatically after OAuth succeeds. You can optionally restrict the watch to specific folders via the management UI (`PUT /user/application/watch-settings`).

## Optional Environment Variables

Set these in `wrangler.jsonc` under `vars` to override defaults:

| Variable                                     | Default                   | Description                                                                                                  |
| -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DEBUG_MODE`                                 | `false`                   | Appends metadata-only processing diagnostics to summary emails when set to `true`                            |
| `SERVE_SPA_FROM_WORKER`                      | `true`                    | Serves the SPA from the Worker catch-all route so API routes are not intercepted by the Cloudflare assets handler |
| `POLICY_AUD`                                 | *(required)*              | Cloudflare Zero Trust application AUD for Access JWT validation                                              |
| `TEAM_DOMAIN`                                | *(required)*              | Cloudflare Zero Trust team domain for JWKS endpoint discovery                                                |
| `MAX_APPLICATIONS_PER_USER`                  | `99`                      | Hard limit on connected applications per user                                                                |
| `MAX_CONTEXT_DOCUMENTS_PER_APPLICATION`      | `1000`                    | Global ceiling on indexed documents per application                                                          |
| `MAX_CONTEXT_MEMORY_CHARS`                   | `1800`                    | Characters of recent context included in AI prompts as conversation memory                                   |
| `MAX_RAG_CONTEXT_CHARS`                      | `6000`                    | Characters of RAG results included in AI prompts                                                             |
| `RAG_TOP_K`                                  | `5`                       | Context documents included in the RAG prompt                                                                 |
| `RAG_VECTOR_QUERY_TOP_K`                     | `50`                      | Candidate documents retrieved from Vectorize before re-ranking                                               |
| `MAX_EMAIL_BODY_CHARS`                       | `12000`                   | Characters of email body sent to AI for summarization                                                        |
| `AI_SUMMARY_MODEL`                           | `@cf/openai/gpt-oss-120b` | Workers AI model for email summarization                                                                     |
| `AI_SUMMARY_FALLBACK_MODEL`                  | `@cf/openai/gpt-oss-20b`  | Workers AI summary model used after the daily neuron fallback threshold is reached                           |
| `AI_DAILY_NEURON_FALLBACK_THRESHOLD`         | `6000`                    | Estimated UTC daily Workers AI neuron usage where summaries switch to the fallback model; set `0` to disable |
| `AI_DAILY_NEURON_FREE_TIER_LIMIT`            | `10000`                   | Estimated daily Workers AI free-tier neuron allowance, used to render the usage bar in the management UI      |
| `AI_EMBEDDING_MODEL`                         | `@cf/baai/bge-m3`         | Workers AI model for context embeddings                                                                      |
| `OAUTH2_STATE_EXPIRY_MINUTES`                | `15`                      | TTL for OAuth2 authorization state values                                                                    |
| `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS` | `900`                     | Seconds before token expiry to trigger a refresh                                                             |
| `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS`      | `60`                      | Minimum seconds a cached token must remain valid to be used without refresh                                  |
| `OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS`   | `3600`                    | Fallback TTL when the provider does not return `expires_in`                                                  |
| `OAUTH2_TOKEN_REFRESH_BATCH_SIZE`            | `25`                      | Maximum number of tokens refreshed per cron cycle                                                            |
| `GMAIL_WATCH_RENEWAL_WINDOW_HOURS`           | `48`                      | Hours before Gmail watch expiry to attempt renewal                                                           |
| `OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS`  | `24`                      | Hours before Outlook subscription expiry to attempt renewal                                                  |
| `OUTLOOK_SUBSCRIPTION_TTL_DAYS`              | `6`                       | Maximum requested TTL for Outlook change notifications                                                       |
| `ACTION_CALLBACK_BASE_URL`                   | `""`                      | Base URL for action callback links; uses the request host if empty                                           |
| `ACTION_DEFAULT_EXPIRY_HOURS`                | `168`                     | Default TTL for email action confirmation tokens                                                             |
| `ACTION_RETENTION_DAYS`                      | `90`                      | Days to retain completed or expired email actions                                                            |

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
