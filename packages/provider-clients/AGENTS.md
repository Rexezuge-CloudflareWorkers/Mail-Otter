# Mail-Otter — Provider Clients

Scope: `packages/provider-clients/**`. Parent index: `../../AGENTS.md`.

Utilities organized by provider subdir (`gmail/`, `outlook/`, `fastmail/`, `oauth2/`, `google-drive/`, `onedrive/`, `yahoo/`, `imap/`, `email-content/`, `http/`): `GmailProviderUtil`, `OutlookProviderUtil`, `OAuth2ProviderUtil` (+ `OAuth2Strategy.ts` map `getOAuth2Strategy()` — no `switch` on provider id), `fastmail/FastmailProviderUtil`, `GoogleDriveProviderUtil`, `OneDriveProviderUtil`, `yahoo/YahooProviderUtil`, `WebhookSecurityUtil`, `EmailContentUtil` (+ `email-content/HtmlContentUtil`, `MimeContentUtil`, `GmailContentUtil`, `TextContentUtil`, `imap/ImapClient`, `BaseProviderHttp` (delegates to injectable `http/HttpClient.ts` `IHttpClient`/`FetchHttpClient`/`StubHttpClient`), `AttachmentTypes`, `ProviderInputs` (`CalendarEventInput`/`DraftReplyInput`/`SummarySendInput`, `ImageAttachmentFilter` + `filterImageAttachments`, `isProviderNotFoundError` — use instead of per-provider copies)).

## Provider Naming

- `google-gmail` / `oauth2` (+ `imap-password`)
- `microsoft-outlook` / `oauth2` (+ `imap-password`)
- `fastmail-jmap` / `oauth2` or `imap-password`
- `yahoo-mail` / `oauth2`
- `custom-imap` / `oauth2` or `imap-password`
- `apple-icloud` / `imap-password`

Connection-method matrix: `PROVIDER_SUPPORTED_CONNECTION_METHODS` in `packages/shared/src/constants/Providers.ts`. `IMAP_PROVIDERS` = `yahoo-mail`, `custom-imap`, `apple-icloud`.

Do not reintroduce password signup or user-managed refresh-token paste flows.

## Microsoft Graph: `internetMessageHeaders` Cannot Be Filtered

`$filter=internetMessageHeaders/any(...)` → 400. Workaround in `OutlookProviderUtil.findSummaryMessageInFolder`: embed a hex marker in the reply subject and filter on `startswith(subject, '[<marker>]')` (`$filter` on `subject` IS supported).

Rules when modifying `sendSelfSummaryReply` / message-finding logic:
- Marker = `deriveMessageMarker` (SHA-256 of message ID, first 8 bytes as hex).
- Send subject: `[${marker}] Re: ${originalSubject}`; filter: `startswith(subject, '[${marker}]')`.
- `X-Mail-Otter-Summary` header still set on outgoing messages for reads via `$select`, not for filtering.

## Outlook Summary Email Sink Flow

`sendSelfSummaryReply` uses a **sink-to-inbox pattern**:

1. Send reply to `{mailboxAddress}+sink@{domain}` (avoids Sent Items noise; plus-addressing supported by M365).
2. Copy the sent message from Sent Items into Inbox (`POST /me/messages/{id}/copy`, `destinationId: inbox`) — inherits `conversationId`, appears in correct thread.
3. Delete from Sent Items (always; `DISABLE_DELETE_AFTER_SEND` was removed).

Sequence: `createReply(sink addr)` → `send` → `copy to inbox` → `delete from Sent Items`. Sink derivation is internal to `sendSelfSummaryReply`.

## Attachment Fetching per Provider

Attachment fetching lives in Layer 3 (`EmailProcessingUtil` in `backend-services`), calling into these clients:
- Gmail: `GmailProviderUtil.getImageAttachments()` — walks `payload.parts`, fetches via Attachments API, base64url → base64.
- Outlook: `OutlookProviderUtil.getImageAttachments()` — `GET .../messages/{id}/attachments?$select=...`.
- Fastmail: `FastmailProviderUtil.downloadImageAttachments()` — JMAP `Email/get` attachments + download endpoint.
- IMAP: **not supported**.
