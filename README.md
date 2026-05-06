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
- Cron trigger: hourly, for subscription renewal

Copy `apps/api/wrangler.template.jsonc` to `wrangler.jsonc` and fill in the D1 database id, secret store id, routes, and `PUBLIC_BASE_URL`.

Create the Vectorize index before deploy:

```bash
source ~/.customrc
volta run npx wrangler vectorize create mail-otter-email-context --dimensions=768 --metric=cosine
```

The management UI lets users enable or disable context indexing per connected application, inspect indexed documents, and delete all indexed documents for one application.

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

## Commands

```bash
source ~/.customrc
volta run pnpm install
volta run pnpm run typecheck
volta run pnpm run test
volta run pnpm run build
```
