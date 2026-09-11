# Mail-Otter — Attachment Vision Analysis

Scope: `packages/backend-services/src/email/AttachmentAnalysisUtil.ts`. Parent index: `../../../AGENTS.md`.

`AttachmentAnalysisUtil` (Layer 3, `backend-services`) calls `@cf/meta/llama-3.2-11b-vision-instruct` (one call per image, `max_tokens: 600`, locale-aware prompt via `AI_LANGUAGE_NAMES`) for a one-sentence summary and action proposals limited to 5 types (`delivery.track_package`, `travel.track_flight`, `finance.pay_bill`, `appointment.confirm`, `manual.todo`). Vision proposals append after text proposals before the action cap.

Gates:
1. Global: `ATTACHMENT_VISION_ENABLED` (default `true`).
2. Per-mailbox: `attachment_vision_enabled` provider-config row (`null`/absent = enabled, `'false'` = disabled). Managed via `PUT /user/application/context` / **Analyze Image Attachments** checkbox.

Attachment fetching per provider (in `EmailProcessingUtil`, Layer 3):
- Gmail: `GmailProviderUtil.getImageAttachments()` — walks `payload.parts`, fetches via Attachments API, base64url → base64.
- Outlook: `OutlookProviderUtil.getImageAttachments()` — `GET .../messages/{id}/attachments?$select=...`.
- Fastmail: `FastmailProviderUtil.downloadImageAttachments()` — JMAP `Email/get` attachments + download endpoint.
- IMAP: **not supported**.

Failures are non-fatal. `attachment_analyzed` audit event written per successful run. Usage tracked via `AiUsageUtil`.
