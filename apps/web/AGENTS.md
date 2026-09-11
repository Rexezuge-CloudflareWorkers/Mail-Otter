# Mail-Otter — Web SPA

Scope: `apps/web/**`. Parent index: `../../AGENTS.md`.

Vite React SPA served at `/user`. Components under `src/components/`: `actions/`, `analytics/`, `context/`, `layout/`, `mailboxes/`, `modals/`, `shared/`, `ui/`, `views/` (`ActionsView`, `ActivityView`, `AnalyticsView`, `ChatView`, `ContextAuditView`, `HelpView`, `MailboxesView`, `ProcessingView`). Locale-aware `lib/format.ts` + `lib/locale.ts`; `LanguageSelector` in `Header`.

## Frontend Internationalization

SPA UI strings live in `src/locales/<tag>/translation.json` (12 locales: `en`, `de`, `fr`, `es`, `it`, `nl`, `pt`, `pl`, `ja`, `zh-CN`, `zh-TW`, `ko`) consumed via `useTranslation()` (`t('ns.key', 'English Default')` — always pass the English default so missing keys still render). Rules for new UI text:

- Add the key + English default to `en/translation.json` first, then mirror it into the other 11 locale files (same key order). Validate with `scripts/validate_locales.py` (JSON-valid, key parity incl. no extra keys, `{{placeholder}}` parity, no empty values).
- Lazy loading: `src/i18n.ts` code-splits per-locale chunks (`loadLanguage`, `import.meta.glob`); never statically import a non-English locale (only `en` is static; breaks code-splitting — see Vite `INEFFECTIVE_DYNAMIC_IMPORT` warning).
- Detection precedence: backend `preferredLanguage` (`GET /user/me`) > `localStorage('mail-otter-lng')` > `navigator.language` > `en`. `SpaApp` applies it and keeps `<html lang>` in sync.
- Dates/numbers: `lib/format.ts` helpers take optional `lng` (pass `i18n.resolvedLanguage`); ad-hoc `toLocale*()` must pass an explicit locale, never rely on the ambient default.
- Backend user text (digest emails, summary shells, action callback pages, chat prompts, tracking labels, Slack/Discord labels, activity CSV header) uses `getBackendStrings(locale)` from `@mail-otter/shared/i18n` — add keys to `BackendStrings.ts` + `locales/en.ts`, then mirror into the 11 backend locale files. Locale source: per-mailbox `contentLanguage` (AI output, digests, action pages), per-user `preferredLanguage` (CSV export, chat fallback). API error `Message` strings stay English (stable `Type` codes); translate display-side only.

## Web UI Text Conventions

**English-source** user-visible text in `apps/web/` must use **Title Case**. Applies to: button labels, headings, card titles, section headers, form labels, placeholders, empty-state messages, toasts, confirm dialogs, `aria-label`, `<option>` text. Translations use each language's natural casing (Title Case is English-only).

**Never hardcode ALL CAPS in JSX.** Use CSS (`uppercase` Tailwind / `text-transform: uppercase`) instead. Components rendering uppercase via CSS — write Title Case in source:

| Component | File | Affected |
|---|---|---|
| `Metric` | `src/components/shared/Metric.tsx` | `label` prop |
| `AuditLogsModal` | `src/components/modals/AuditLogsModal.tsx` | event type span |
| `ContextDocumentRow` | `src/components/context/ContextDocumentRow.tsx` | `AuditValue` label |
| `IntegrationsSection` | `src/components/mailboxes/IntegrationsSection.tsx` | section badge |
| `RulesSection` | `src/components/mailboxes/RulesSection.tsx` | badges |
| `DigestSection` | `src/components/mailboxes/DigestSection.tsx` | section badge |
| `AutoExecuteSection` | `src/components/mailboxes/AutoExecuteSection.tsx` | section badge |
| `ActionsView` | `src/components/views/ActionsView.tsx` | badge |
| `HelpView` | `src/components/views/HelpView.tsx` | badges |

**Exceptions** (no Title Case): `<code>` content, technical URI placeholders, dynamic API response content.
