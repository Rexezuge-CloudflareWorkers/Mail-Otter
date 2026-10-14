# Mail-Otter — Background Worker

Scope: `apps/background/**`. Parent index: `../../AGENTS.md`.

- `CronTasksWorker.ts` — DO serializing cron in two phases via `scheduled/TaskRegistry.ts` (`tasksForPhase(1|2)`; add tasks there, not in the worker):
  - Phase 1 (parallel): `OAuth2AccessTokenRefreshTask`, `ContextDocumentPruningTask`, `ImapPollingTask`, `CalendarEventSyncTask`, `GoogleDriveSyncTask`, `OneDriveSyncTask`, `ActionStatusSyncTask`, `SubscriptionRenewalTask` (wraps `SubscriptionRenewalUtil`)
  - Phase 2 (parallel): `ProcessedMessagePruningTask`, `StaleContextDocumentPruningTask`, `OAuth2SessionPruningTask`, `ContextDeletionRunPruningTask`, `AiDailyUsagePruningTask`, `EmailActionPruningTask`, `AuditLogPruningTask`, `IntegrationDeliveryLogPruningTask`, `ScheduledDigestTask`, `SyncedCalendarEventPruningTask`, `BackgroundTaskRunPruningTask`, `ScheduledActionExecutionTask`
- Tasks resolve services via `createRequestScope(env)` from `@mail-otter/backend-services/composition` (`scope.get(Tokens.X)`); never `new XService(env)` in new code.
- Shared scheduled bases: `IScheduledTask` (Template Method + `createApplicationRun` Builder + `createTaskRunDAO` Factory Method for tests), `AbstractPruningTask` (Template Method for all retention pruning: `getRetentionDays` + `pruneBatch` abstract, cutoff + `pruneInBatches` in base; 6+ pruning tasks extend it), `BaseDriveSyncTask` (both Drive sync tasks), `RepositoryHelper.pruneInBatches` (`pruneInBatches`, `computeUnixCutoffSeconds`, `computeDateCutoffIso`, `DEFAULT_PRUNE_BATCH_SIZE` in `backend-data/utils`).

### Why `IScheduledTask` is not `@rexezuge/runtime`'s `AbstractScheduledTask`

`@rexezuge/runtime` ships the converged Template Method and it is a better base in every generic respect. It is still not adopted here, for two reasons that are **behaviour**, not ergonomics — re-check both before assuming they have been fixed.

**It rethrows by default; this one swallows.** The kit's `swallowErrors()` defaults to `false`, so a failed task throws once its run record says why. `CronTasksWorker.runScheduledTasks` awaits `Promise.all(tasksForPhase(1).map(...))` with no per-task catch, so one throw would reject the phase and **phase 2 would never run** — nineteen other tasks silently skipped by one failure. This repo's contract is the opposite: each task records its own failure to `background_task_runs` (visible at `GET /user/processing/task-runs`) and the phase continues.

**It writes the raw error message to the database.** The kit computed `error instanceof Error ? error.message : String(error)` inline. Run records are persisted and surfaced through an authenticated route, so a failure message carrying a token would write credential material into the database and hand it to whoever loads the task-runs screen. This base routes it through `ErrorSanitizationUtil.sanitizeErrorForLogging` first, which is a hard requirement — see the logging rule below.

Both have been addressed upstream: SDK `f896da0` added an overridable `describeFailure` seam, and `swallowErrors()` already exists as the documented escape hatch for the rethrow. Adoption becomes possible once the first reaches a published version — then this file becomes a short subclass supplying `describeFailure`, `swallowErrors() → true`, and the DAO-backed `createRunRecorder`.

- `EmailEventsDispatcherWorker.ts` — Queue consumer → `EmailProcessingWorkflow`.
- `EmailProcessingWorkflow.ts` — Workflow: resolve apps, list messages, summarize, post replies. IMAP connect options delegate to `buildImapConnectOptions` in `@mail-otter/backend-services/provider` (`ImapConnectionFactory`, single source of host/port defaults); no local defaults table.
- `OAuth2TokenRefreshWorker.ts` — DO for token refresh and auth-code exchange.
- Error logging in token-adjacent `try` blocks: use `logTokenAdjacentError(level, message, ids)` from `@mail-otter/shared/utils` — static messages with application/subscription IDs only, never the caught error (CodeQL `js/clear-text-logging` traces OAuth2 token taint through the thrown error and does not model `String#replaceAll` as a masking barrier). Use `logError(level, message, error)` for non-token paths; it redacts Bearer/Basic headers, token KV pairs, query params, JWTs, and `ya29.` tokens via `ErrorSanitizationUtil`. Never call `console.*` with a caught error directly. Values persisted for later display (e.g. `BackgroundTaskRunDAO.failRun`, surfaced by `GET /user/processing/task-runs`) must be run through `ErrorSanitizationUtil` first.

## Background Task Visibility

`ProcessingView` (`apps/web/src/components/views/`) exposes cron task run history, synced calendar events, and processed messages. Routes:

- `GET /user/processing/task-runs` — `BackgroundTaskRunDAO`
- `GET /user/processing/calendar-events` — `SyncedCalendarEventDAO`
- `GET /user/processing/messages` — `ProcessedMessageDAO`
- `POST /user/processing/run-task` — manual trigger via `ProcessingService`

Retention: `BACKGROUND_TASK_RUN_RETENTION_DAYS` (default 30), pruned by `BackgroundTaskRunPruningTask`.
