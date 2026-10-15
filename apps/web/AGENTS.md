# Mail-Otter — Web SPA

Scope: `apps/web/**`. Parent index: `../../AGENTS.md`.

Vite React SPA served at `/user`. Components under `src/components/`: `actions/`, `analytics/`, `context/`, `layout/` (`SpaViewRouter.tsx` owns the view switch), `mailboxes/` (`RulesSection.tsx` is a composition facade over `ruleLabels.ts`, `formatCondition.ts`, `RuleList.tsx`, `RuleEditor.tsx`), `modals/`, `shared/`, `ui/`, `views/` (`ActionsView`, `ActivityView`, `AnalyticsView`, `ChatView`, `ContextAuditView`, `HelpView`, `MailboxesView`, `ProcessingView`). Hooks: `useMailboxes.ts` delegates to `useApplications.ts` + `useIntegrations.ts` slices (return shape stable); `useSpaLanguage.ts` owns SPA language state (`SpaApp.tsx` stays a thin shell composing hooks + `SpaViewRouter`). `src/adapters/mailboxAdapter.ts` maps `ConnectedApplication ↔ Mailbox` (`toMailbox`/`fromMailbox`). Locale-aware `lib/format.ts` + `lib/locale.ts`; `LanguageSelector` in `Header`.

## From `@rexezuge/web`

`Unauthorized`, `NoticeBar` and the timer behind `useNotice` are the kit's. What stays local is the URL seeding: `GET /api/oauth2/callback` redirects back with `?oauth2=connected|error`, so `hooks/useNotice.ts` reads that out of the query string and hands it to the kit's `useNotice` as `initial`.

Two consequences worth knowing:

- The notice shape is `{ kind, message }`, not `{ type, text }`. Six copies of this hook and six of the banner each used a different pair of names, so every call site shuffled fields to feed a component its own hook had already produced. There is now one shape.
- `NoticeBar` requires `statusLabels` keyed by kind. Pass translated strings — it cannot invent English for a locale it does not know about.

`Unauthorized`'s sign-in navigation is an `onAuthenticate` prop rather than a hard-coded `location.assign`, which is what makes the button's behaviour testable at all (jsdom refuses to navigate, so before, that branch had no assertions).

The build (`vite.config.ts`) and both Vitest configs come from `@rexezuge/tooling`; the only local pieces are the Terser `drop_console`/`drop_debugger` policy and the coverage floors.

**`apps/web` must not import `@mail-otter/*` at all.** That is an ESLint boundary from `@rexezuge/tooling`, not a convention: a backend package reached from the SPA typechecks and then fails at bundle time, with the error pointing at the bundler rather than at the boundary that caused it.

## The kit's controls render class names, and the scanner cannot see them

Tailwind v4 scans only the Vite root — `apps/web` — which excludes `node_modules`. Every control taken from `@rexezuge/web` renders its styling as Tailwind class names inside the package's emitted JavaScript, so without `globals.css` naming the kit as a source, none of them are candidates for the build:

    @source "../node_modules/@rexezuge/web/dist/*.js";

That line is load-bearing. Deleting it costs `NoticeBar` its slide-down, its centring and its screen-reader prefix, and `Unauthorized` its focus ring — while the build stays green, because a class the compiler never sees is an absence rather than an error. The `@theme` colour variables are a separate job and do not cover this: a variable nothing references generates nothing, and neither does a class name the scanner never reads.

`pnpm run verify:kit-css` reads the emitted stylesheet and fails if those utilities are gone. It is a step in the `build` CI job, after the web build, because a check that runs before its build inspects whatever `dist/` the runner happened to have and passes for the wrong reason. `apps/web/dist` is gitignored and `postinstall` writes a stub, so the build is a precondition of the check rather than a convenience.

**Do not spell a Tailwind utility class name anywhere under `apps/web/` — this file included.** The scan root is `apps/web/**` and the scanner reads Markdown as readily as JSX, so a class named here is emitted into the production bundle whether or not the kit is a source. That is not pedantry: it silently satisfies the gate above, which is how a guarded utility comes to measure a paragraph instead of the kit. `test/kit-css-checks.test.ts` walks the scan root and fails if a guarded utility is written under it, so a documentation edit fails the suite instead of quietly arming the guard with a blank. Name the control and what looks wrong without it — a notice banner that will not centre, a sign-in link with no focus ring — and not the utility.

`scripts/build/kit-css-checks.ts` holds the list and the rule, and keeps at least one utility per kit component this app imports that emits classes at all, so adopting another control means adding its token rather than discovering later that half the kit is unguarded.

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

| Component             | File                                               | Affected           |
| --------------------- | -------------------------------------------------- | ------------------ |
| `Metric`              | `src/components/shared/Metric.tsx`                 | `label` prop       |
| `AuditLogsModal`      | `src/components/modals/AuditLogsModal.tsx`         | event type span    |
| `ContextDocumentRow`  | `src/components/context/ContextDocumentRow.tsx`    | `AuditValue` label |
| `IntegrationsSection` | `src/components/mailboxes/IntegrationsSection.tsx` | section badge      |
| `RulesSection`        | `src/components/mailboxes/RulesSection.tsx`        | badges             |
| `DigestSection`       | `src/components/mailboxes/DigestSection.tsx`       | section badge      |
| `AutoExecuteSection`  | `src/components/mailboxes/AutoExecuteSection.tsx`  | section badge      |
| `ActionsView`         | `src/components/views/ActionsView.tsx`             | badge              |
| `HelpView`            | `src/components/views/HelpView.tsx`                | badges             |

**Exceptions** (no Title Case): `<code>` content, technical URI placeholders, dynamic API response content.
