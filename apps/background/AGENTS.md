# Mail-Otter — Background Worker

Scope: `apps/background/**`. Parent index: `../../AGENTS.md`.

- `CronTasksWorker.ts` — DO serializing cron in two phases via `scheduled/TaskRegistry.ts` (`tasksForPhase(1|2)`; add tasks there, not in the worker):
  - Phase 1 (parallel): `OAuth2AccessTokenRefreshTask`, `ContextDocumentPruningTask`, `ImapPollingTask`, `CalendarEventSyncTask`, `GoogleDriveSyncTask`, `OneDriveSyncTask`, `ActionStatusSyncTask`, `SubscriptionRenewalTask` (wraps `SubscriptionRenewalUtil`)
  - Phase 2 (parallel): `ProcessedMessagePruningTask`, `StaleContextDocumentPruningTask`, `OAuth2SessionPruningTask`, `ContextDeletionRunPruningTask`, `AiDailyUsagePruningTask`, `EmailActionPruningTask`, `AuditLogPruningTask`, `IntegrationDeliveryLogPruningTask`, `ScheduledDigestTask`, `SyncedCalendarEventPruningTask`, `BackgroundTaskRunPruningTask`, `ScheduledActionExecutionTask`
- Tasks resolve services via `createRequestScope(env)` from `@mail-otter/backend-services/composition` (`scope.get(Tokens.X)`); never `new XService(env)` in new code.
- Shared scheduled bases: `IScheduledTask` (Template Method + `createApplicationRun` Builder + `createTaskRunDAO` Factory Method for tests), `AbstractPruningTask` (Template Method for all retention pruning: `getRetentionDays` + `pruneBatch` abstract, cutoff + `pruneInBatches` in base; 6+ pruning tasks extend it), `BaseDriveSyncTask` (both Drive sync tasks), `RepositoryHelper.pruneInBatches` (`pruneInBatches`, `computeUnixCutoffSeconds`, `computeDateCutoffIso`, `DEFAULT_PRUNE_BATCH_SIZE` in `backend-data/utils`).
- `EmailEventsDispatcherWorker.ts` — Queue consumer → `EmailProcessingWorkflow`.
- `EmailProcessingWorkflow.ts` — Workflow: resolve apps, list messages, summarize, post replies. IMAP connect options delegate to `buildImapConnectOptions` in `@mail-otter/backend-services/provider` (`ImapConnectionFactory`, single source of host/port defaults); no local defaults table.
- `OAuth2TokenRefreshWorker.ts` — DO for token refresh and auth-code exchange.
- Error logging in token-adjacent `try` blocks: log and `run.fail()` static messages with application/subscription IDs only — never interpolate the caught error (CodeQL `js/clear-text-logging` traces OAuth2 token taint through the thrown error and does not model `String#replaceAll` as a masking barrier).

## Background Task Visibility

`ProcessingView` (`apps/web/src/components/views/`) exposes cron task run history, synced calendar events, and processed messages. Routes:
- `GET /user/processing/task-runs` — `BackgroundTaskRunDAO`
- `GET /user/processing/calendar-events` — `SyncedCalendarEventDAO`
- `GET /user/processing/messages` — `ProcessedMessageDAO`
- `POST /user/processing/run-task` — manual trigger via `ProcessingService`

Retention: `BACKGROUND_TASK_RUN_RETENTION_DAYS` (default 30), pruned by `BackgroundTaskRunPruningTask`.
