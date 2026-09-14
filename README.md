# Mail-Otter

Mail-Otter is a Cloudflare Workers app (API worker + background cron/queue/workflow/Durable Objects) that watches connected mailboxes across six providers (Gmail, Outlook, Fastmail, Yahoo, custom IMAP, iCloud), summarizes new messages with Workers AI, and posts a private self-addressed summary reply in the same thread.

Users bring their own OAuth app credentials. Gmail also requires a Google Pub/Sub topic and push subscription.

Optional RAG context indexing lets the AI draw on recent indexed email content when generating summaries. From each summary the AI can suggest structured email actions — calendar events, draft replies, links, to-dos, package/flight tracking, bill payments, and appointment confirmations (8 types, see below) — each with a public confirmation/denial callback flow that works from any email client, plus manual execution from the management UI.

Mailboxes carry their own time zone so calendar events stay correct, optional sender domain filters scope which senders are processed, and a usage analytics dashboard summarizes AI usage, processing outcomes, actions, and context indexing.

## Providers

- `google-gmail` / `oauth2` (+ `imap-password`)
- `microsoft-outlook` / `oauth2` for personal Outlook.com, Hotmail, and Live accounts (+ `imap-password`)
- `fastmail-jmap` / `oauth2` or `imap-password` for Fastmail
- `yahoo-mail` / `oauth2`
- `custom-imap` / `oauth2` or `imap-password`
- `apple-icloud` / `imap-password`

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
- Cron trigger: every 10 minutes, in two phases — Phase 1: OAuth2 token refresh, context document pruning, IMAP polling, calendar event sync, Google Drive sync, OneDrive sync, action status sync, subscription renewal; Phase 2: processed message pruning, stale context document pruning, OAuth2 session pruning, context deletion run pruning, AI daily usage pruning, email action pruning, audit log pruning, integration delivery log pruning, scheduled digest delivery, synced calendar event pruning, background task run pruning, and scheduled action execution

Copy `apps/api/wrangler.template.jsonc` to `wrangler.jsonc` and fill in the D1 database id, KV namespace id, secret store ids, and routes.

Create the Vectorize index before deploy:

```bash
npx wrangler vectorize create mail-otter-email-context --dimensions=768 --metric=cosine
```

The management UI lets users enable or disable context indexing per connected application, set a per-application document limit, inspect indexed documents, view provider links to original emails, view audit logs, view deletion runs, and delete all indexed documents for one application. A global ceiling (`MAX_CONTEXT_DOCUMENTS_PER_APPLICATION`, default 1000) caps the limit across all applications; the cron task automatically prunes oldest documents when an application exceeds its effective limit.

## Email Actions

When processing an email, the AI can generate one or more suggested actions. Each action has a type and a typed payload:

- `calendar.add_event` — add an event to the connected calendar (requires the optional Calendar feature; see below)
- `email.draft_reply` — prepare a draft reply
- `external.open_link` — open a relevant link
- `manual.todo` — record a manual to-do
- `delivery.track_package` — track a package shipment (requires `PACKAGE_TRACKING_API_KEY` via Aftership)
- `travel.track_flight` — track a flight (requires `FLIGHT_TRACKING_API_KEY` via Aviationstack)
- `finance.pay_bill` — record a bill due for payment
- `appointment.confirm` — confirm a scheduled appointment

Each action gets an encrypted and signed callback URL that is posted in the summary reply:

```text
https://your-domain.example/api/actions/{actionId}
https://your-domain.example/api/actions/{actionId}/execute
```

These routes are publicly accessible because email clients render the links. Security relies on `ACTION_ENCRYPTION_KEY_SECRET` (AES-GCM encryption of the action payload) and `ACTION_SIGNING_SECRET` (HMAC signing of the action token).

Users can also view, manually execute, and track execution history of actions via the management UI (`GET /user/actions`, `POST /user/actions/:actionId/execute`).

Any `pending` action can be snoozed (`POST /user/actions/:actionId/snooze`, up to 30 days with a 24h expiry buffer). `calendar.add_event` and `email.draft_reply` additionally support scheduled auto-execution (`POST /user/actions/:actionId/schedule`, up to 30 days with a 1h expiry buffer, run by the scheduled-action-execution cron task) and UI-configured auto-execute. Action statuses are `pending`/`executing`/`succeeded`/`failed`/`expired`/`cancelled`; triggers are `email_callback`, `web_ui`, `system_expiry`, `auto_execute`, and `scheduled`.

## Calendar Feature And Time Zones

`calendar.add_event` actions require the optional **Calendar** feature, which is enabled per connected application in the management UI. Enabling it requests additional OAuth scopes (`https://www.googleapis.com/auth/calendar.events` for Gmail, `https://graph.microsoft.com/Calendars.ReadWrite` for Outlook, `urn:ietf:params:jmap:calendars` for Fastmail), so the mailbox must be re-authorized after enabling. The same re-auth pattern applies to the optional **Google Drive** (`https://www.googleapis.com/auth/drive.readonly`) and **OneDrive** (`https://graph.microsoft.com/Files.Read`) ingestion features (see below).

Each connected mailbox has its own time zone (defaulting to `UTC`). Calendar events and event-facing dates in summaries are rendered in the mailbox's configured zone, so they stay correct regardless of where the Worker runs.

## Sender Domain Filters

Each connected application can optionally define a sender allowlist (`includeRules`, up to 100). With no include rules, all senders are processed; with include rules, only matching senders are processed. To block a sender, create a processing rule (field `from`, op `matches_sender`, action `skip`). Configure filters in the management UI.

## Analytics

The management UI includes an analytics dashboard (`GET /user/analytics`) summarizing Workers AI usage (estimated neurons and request counts over time), processing outcomes, email action counts, and context indexing — overall or scoped to a single application, over a selectable number of days.

## Email Processing Rules

Each connected application can define up to 20 email processing rules. Rules have a condition (all/any of up to 5 field matchers) and an action. Rules are split into two phases:

- **Pre-processing** (first match wins): `skip` skips the message, `skip_actions` disables AI action proposals, `prepend_instruction` injects text into the AI prompt.
- **Post-processing** (all matches applied after summarization): `apply_label`, `archive_message`, `mark_read`, `star_message`.

Configure rules in the management UI. The UI also offers AI-assisted rule suggestion from a plain-language description.

## Scheduled Digest

Each connected application can optionally enable a **daily digest**: a scheduled email summarizing pending actions, upcoming calendar events, package statuses, flight statuses, bills due, and appointments. Configure the send time, enabled sections, and delivery in the management UI (`GET|PUT /user/application/digest`). Trigger an immediate send with `POST /user/application/digest/send`.

## Outbound Integrations

Each connected application can define outbound integrations (`slack`, `discord`, or generic `webhook`) that receive a JSON payload whenever an email is processed. Deliveries are logged and viewable in the management UI. Add, edit, test, and remove integrations under the Integrations section of each mailbox.

## Attachment Vision

Image attachments on Gmail, Outlook, and Fastmail can be analyzed with a vision model (`@cf/meta/llama-3.2-11b-vision-instruct`, one call per image) to append a one-sentence summary and propose tracking/to-do actions (`delivery.track_package`, `travel.track_flight`, `finance.pay_bill`, `appointment.confirm`, `manual.todo`). Enabled globally by default (`ATTACHMENT_VISION_ENABLED=true`) and toggleable per mailbox via the **Analyze Image Attachments** checkbox (`PUT /user/application/context`). IMAP fetching is not supported; failures are non-fatal.

## Drive And OneDrive Ingestion

Gmail mailboxes can opt into **Google Drive** ingestion and Outlook mailboxes into **OneDrive** ingestion as additional RAG sources. Enable the feature per mailbox in the management UI (requires re-authorization for the extra OAuth scope), then the Phase 1 `GoogleDriveSyncTask` / `OneDriveSyncTask` cron tasks poll for changed files (up to `MAX_DRIVE_FILES_PER_SYNC=20` per mailbox per cycle, 2 MB per-file cap shared with attachments) into the same Vectorize + D1 context pipeline as emails.

## Activity Feed

The management UI includes an activity feed (`GET /user/activity`) merging `email_processed`, `action_created`, and `action_executed` events in reverse-chronological order, filterable by mailbox and event type (`limit` default 50, max 100; `format=csv` exports up to 1000 entries).

## AI Email Chat

The management UI includes an AI chat (`POST /user/chat`) that answers questions over indexed email/drive context. Requests are stateless but support multi-turn conversation via a `history` array (`{ query, applicationId?, history[] }` → `{ answer, sources[], truncated }`), using the configured embedding + summary models with per-mailbox content language.

## Internationalization

The SPA ships 12 locales (`en`, `de`, `fr`, `es`, `it`, `nl`, `pt`, `pl`, `ja`, `zh-CN`, `zh-TW`, `ko`; switcher in the header). Each mailbox also carries a content language for AI output, digests, and action pages, while each user has a preferred language (`GET|PUT /user/me`) used for chat fallback and CSV export.

## Background Task Visibility

The **Processing** view in the management UI shows per-application background task run history, synced calendar events, and processed message history. Individual tasks (calendar sync, action status sync) can also be triggered manually from the UI.

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

Mail-Otter requests scopes dynamically based on the features enabled for each application. Enabling the optional Calendar feature additionally requests `https://www.googleapis.com/auth/calendar.events` (Gmail), `Calendars.ReadWrite` (Microsoft), or `urn:ietf:params:jmap:calendars` (Fastmail); enabling Google Drive requests `https://www.googleapis.com/auth/drive.readonly` and enabling OneDrive requests `Files.Read`. Re-authorize the mailbox after changing enabled features.

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

## Fastmail Watch

For Fastmail JMAP connections, Mail-Otter can authenticate via OAuth2 or an IMAP app password. After connecting, the watch is started automatically. Incoming message events are delivered via Fastmail's webhook push mechanism to `POST /api/webhooks/fastmail/:applicationId`.

## Outlook Watch

For Outlook, the watch is started automatically after OAuth succeeds. You can optionally restrict the watch to specific folders via the management UI (`PUT /user/application/watch-settings`).

## Optional Environment Variables

Set these in `wrangler.jsonc` under `vars` to override defaults:

| Variable                                     | Default                                  | Description                                                                                                  |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DEBUG_MODE`                                 | `false`                                  | Appends metadata-only processing diagnostics to summary emails when set to `true`                            |
| `POLICY_AUD`                                 | _(required)_                             | Cloudflare Zero Trust application AUD for Access JWT validation                                              |
| `TEAM_DOMAIN`                                | _(required)_                             | Cloudflare Zero Trust team domain for JWKS endpoint discovery                                                |
| `MAX_APPLICATIONS_PER_USER`                  | `99`                                     | Hard limit on connected applications per user                                                                |
| `MAX_CONTEXT_DOCUMENTS_PER_APPLICATION`      | `1000`                                   | Global ceiling on indexed documents per application                                                          |
| `MAX_CONTEXT_MEMORY_CHARS`                   | `1800`                                   | Characters of recent context included in AI prompts as conversation memory                                   |
| `MAX_RAG_CONTEXT_CHARS`                      | `6000`                                   | Characters of RAG results included in AI prompts                                                             |
| `RAG_TOP_K`                                  | `5`                                      | Context documents included in the RAG prompt                                                                 |
| `RAG_VECTOR_QUERY_TOP_K`                     | `50`                                     | Candidate documents retrieved from Vectorize before re-ranking                                               |
| `MAX_EMAIL_BODY_CHARS`                       | `12000`                                  | Characters of email body sent to AI for summarization                                                        |
| `AI_SUMMARY_MODEL`                           | `@cf/google/gemma-4-26b-a4b-it`          | Workers AI model for email summarization                                                                     |
| `AI_SUMMARY_FALLBACK_MODEL`                  | `@cf/openai/gpt-oss-20b`                 | Workers AI summary model used after the daily neuron fallback threshold is reached                           |
| `AI_DAILY_NEURON_FALLBACK_THRESHOLD`         | `6000`                                   | Estimated UTC daily Workers AI neuron usage where summaries switch to the fallback model; set `0` to disable |
| `AI_DAILY_NEURON_FREE_TIER_LIMIT`            | `10000`                                  | Estimated daily Workers AI free-tier neuron allowance, used to render the usage bar in the management UI     |
| `AI_DAILY_USAGE_RETENTION_DAYS`              | `90`                                     | Days to retain AI daily usage records                                                                        |
| `AI_EMBEDDING_MODEL`                         | `@cf/baai/bge-m3`                        | Workers AI model for context embeddings                                                                      |
| `OAUTH2_STATE_EXPIRY_MINUTES`                | `15`                                     | TTL for OAuth2 authorization state values                                                                    |
| `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS` | `900`                                    | Seconds before token expiry to trigger a refresh                                                             |
| `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS`      | `60`                                     | Minimum seconds a cached token must remain valid to be used without refresh                                  |
| `OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS`   | `3600`                                   | Fallback TTL when the provider does not return `expires_in`                                                  |
| `OAUTH2_TOKEN_REFRESH_BATCH_SIZE`            | `25`                                     | Maximum number of tokens refreshed per cron cycle                                                            |
| `GMAIL_WATCH_RENEWAL_WINDOW_HOURS`           | `48`                                     | Hours before Gmail watch expiry to attempt renewal                                                           |
| `OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS`  | `24`                                     | Hours before Outlook subscription expiry to attempt renewal                                                  |
| `OUTLOOK_SUBSCRIPTION_TTL_DAYS`              | `6`                                      | Maximum requested TTL for Outlook change notifications                                                       |
| `RENEWAL_RETRY_BASE_DELAY_SECONDS`           | `300`                                    | Base delay for watch/subscription renewal retries                                                            |
| `RENEWAL_RETRY_MAX_DELAY_SECONDS`            | `14400`                                  | Max delay for watch/subscription renewal retries                                                             |
| `PROCESSED_MESSAGE_RETENTION_DAYS`           | `90`                                     | Days to retain processed message records                                                                     |
| `STALE_CONTEXT_DOCUMENT_DELETED_GRACE_DAYS`  | `30`                                     | Grace days before pruning deleted context documents                                                          |
| `STALE_CONTEXT_DOCUMENT_ERROR_GRACE_DAYS`    | `90`                                     | Grace days before pruning errored context documents                                                          |
| `CONTEXT_DELETION_RUN_RETENTION_DAYS`        | `90`                                     | Days to retain context deletion run records                                                                  |
| `CONTEXT_AUDIT_LOG_RETENTION_DAYS`           | `90`                                     | Days to retain context audit log entries                                                                     |
| `ATTACHMENT_VISION_ENABLED`                  | `true`                                   | Enable vision analysis of image attachments                                                                  |
| `ATTACHMENT_VISION_MODEL`                    | `@cf/meta/llama-3.2-11b-vision-instruct` | Workers AI vision model for attachment analysis                                                              |
| `MAX_ATTACHMENT_SIZE_BYTES`                  | `2097152`                                | Max image attachment size (bytes) sent to the vision model                                                   |
| `MAX_ATTACHMENTS_PER_EMAIL`                  | `3`                                      | Max image attachments analyzed per email                                                                     |
| `MAX_DRIVE_FILES_PER_SYNC`                   | `20`                                     | Max Drive/OneDrive files ingested per mailbox per cron cycle                                                 |
| `CHAT_MAX_RESPONSE_TOKENS`                   | `1000`                                   | Max tokens in an AI chat response                                                                            |
| `CHAT_VECTOR_QUERY_TOP_K`                    | `20`                                     | Candidate context documents retrieved from Vectorize for chat                                                |
| `CHAT_CONTEXT_TOP_K`                         | `5`                                      | Context documents included in the chat prompt                                                                |
| `CHAT_MAX_HISTORY_MESSAGES`                  | `10`                                     | Max prior chat messages included as conversation history                                                     |
| `PUBLIC_BASE_URL`                            | `""`                                     | Public base URL; required for automatic recovery of deleted Outlook subscriptions                            |
| `ACTION_CALLBACK_BASE_URL`                   | `""`                                     | Base URL for action callback links; uses the request host if empty                                           |
| `ACTION_DEFAULT_EXPIRY_HOURS`                | `168`                                    | Default TTL for email action confirmation tokens                                                             |
| `ACTION_RETENTION_DAYS`                      | `90`                                     | Days to retain completed or expired email actions                                                            |
| `PACKAGE_TRACKING_API_KEY`                   | `""`                                     | Aftership API key for live package tracking; leave empty to disable `delivery.track_package` execution       |
| `FLIGHT_TRACKING_API_KEY`                    | `""`                                     | Aviationstack API key for live flight tracking; leave empty to disable `travel.track_flight` execution       |
| `BACKGROUND_TASK_RUN_RETENTION_DAYS`         | `30`                                     | Days to retain background task run records                                                                   |
| `INTEGRATION_DELIVERY_LOG_RETENTION_DAYS`    | `30`                                     | Days to retain outbound integration delivery log entries                                                     |

## Continuous Deployment Variables

GitHub Actions deployments can patch Worker `vars` without replacing the whole Wrangler configuration. Set the repository variable `WRANGLER_VARS_PATCH_JSON` to a JSON object of string values. The deployment merges it into top-level `vars` after loading `WRANGLER_JSONC` or `apps/api/wrangler.template.jsonc`.

```json
{
  "POLICY_AUD": "your-cloudflare-zero-trust-application-aud",
  "TEAM_DOMAIN": "https://your-cloudflare-zero-trust-team-domain.cloudflareaccess.com"
}
```

Do not put secrets in `WRANGLER_VARS_PATCH_JSON`; use GitHub secrets, Wrangler secrets, or Cloudflare Secrets Store for sensitive values.

Local-only: `DEV_AUTH_EMAIL` (no default) bypasses Cloudflare Access for local development; never set in production.

## Commands

```bash
pnpm install
pnpm -r typecheck && pnpm run lint && pnpm run test:coverage && pnpm run test:integration
pnpm run typegen   # after changing wrangler bindings
pnpm --filter @mail-otter/web dev     # vite dev server
pnpm --filter @mail-otter/web build
```
