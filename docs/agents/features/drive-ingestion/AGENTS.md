# Mail-Otter — Google Drive And OneDrive Ingestion

Scope: `packages/backend-services/src/drive/**`, provider clients `GoogleDriveProviderUtil`, `OneDriveProviderUtil`. Parent index: `../../../AGENTS.md`.

Enable via feature toggle (`google_drive` for Gmail, `onedrive` for Outlook — see `OAUTH2_FEATURE_SCOPES`: `drive.readonly`, `Files.Read`) — adds Drive scope and requires re-auth. Off by default.

Background: `GoogleDriveSyncTask` / `OneDriveSyncTask` (Phase 1) poll for changed files → Vectorize + D1 RAG pipeline.

**Supported file types**: Google Docs/Sheets/Slides exports plus downloadable DOCX/PPTX/XLSX (`DOWNLOADABLE_MIME_TYPES`: `text/plain`, `markdown`, `csv`, `pdf`), OneDrive DOCX/PPTX/XLSX (PDF via Graph `?format=pdf`, then text), `.txt`/`.md`/`.csv`/`.pdf`/`.docx`/`.pptx`/`.xlsx` (extension fallback; `TextDecoder` for text, `DriveDocumentUtil.extractTextFromPdf` Tj/TJ extraction for PDFs).

**Sync cursors** (provider-config rows): `google_drive_page_token`, `onedrive_delta_link`. First Google Drive run establishes cursor and returns — no backfill by design.

**Source types** (`packages/shared/src/constants/Context.ts`): `CONTEXT_SOURCE_TYPE_GOOGLE_DRIVE = 'google_drive'`, `CONTEXT_SOURCE_TYPE_ONEDRIVE = 'microsoft_onedrive'`.

**Deduplication**: `upsertDriveDocument` stores `contentFingerprint` (HMAC of indexed text); unchanged fingerprint with non-null `indexedAt` = skip re-embedding.

File size limit reuses `MAX_ATTACHMENT_SIZE_BYTES` (2 MB). `MAX_DRIVE_FILES_PER_SYNC` (20) caps per app per cron cycle.
