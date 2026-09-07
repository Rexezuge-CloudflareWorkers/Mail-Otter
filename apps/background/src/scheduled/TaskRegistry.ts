import { ActionStatusSyncTask } from './ActionStatusSyncTask';
import { AiDailyUsagePruningTask } from './AiDailyUsagePruningTask';
import { AuditLogPruningTask } from './AuditLogPruningTask';
import { BackgroundTaskRunPruningTask } from './BackgroundTaskRunPruningTask';
import { CalendarEventSyncTask } from './CalendarEventSyncTask';
import { ContextDeletionRunPruningTask } from './ContextDeletionRunPruningTask';
import { ContextDocumentPruningTask } from './ContextDocumentPruningTask';
import { EmailActionPruningTask } from './EmailActionPruningTask';
import { GoogleDriveSyncTask } from './GoogleDriveSyncTask';
import { ImapPollingTask } from './ImapPollingTask';
import { IntegrationDeliveryLogPruningTask } from './IntegrationDeliveryLogPruningTask';
import { OAuth2AccessTokenRefreshTask } from './OAuth2AccessTokenRefreshTask';
import { OAuth2SessionPruningTask } from './OAuth2SessionPruningTask';
import { OneDriveSyncTask } from './OneDriveSyncTask';
import { ProcessedMessagePruningTask } from './ProcessedMessagePruningTask';
import { ScheduledActionExecutionTask } from './ScheduledActionExecutionTask';
import { ScheduledDigestTask } from './ScheduledDigestTask';
import { StaleContextDocumentPruningTask } from './StaleContextDocumentPruningTask';
import { SubscriptionRenewalTask } from './SubscriptionRenewalTask';
import { SyncedCalendarEventPruningTask } from './SyncedCalendarEventPruningTask';
import type { IEnv, IScheduledTask } from './IScheduledTask';

type CronPhase = 1 | 2;

interface TaskDefinition {
  phase: CronPhase;
  make: () => IScheduledTask<IEnv>;
}

// Composite registry for cron phases. Adding a task no longer requires
// editing CronTasksWorker — append a definition here instead.
const CRON_TASK_DEFINITIONS: readonly TaskDefinition[] = [
  { phase: 1, make: () => new OAuth2AccessTokenRefreshTask() },
  { phase: 1, make: () => new ContextDocumentPruningTask() },
  { phase: 1, make: () => new ImapPollingTask() },
  { phase: 1, make: () => new CalendarEventSyncTask() },
  { phase: 1, make: () => new GoogleDriveSyncTask() },
  { phase: 1, make: () => new OneDriveSyncTask() },
  { phase: 1, make: () => new ActionStatusSyncTask() },
  { phase: 1, make: () => new SubscriptionRenewalTask() },
  { phase: 2, make: () => new ProcessedMessagePruningTask() },
  { phase: 2, make: () => new StaleContextDocumentPruningTask() },
  { phase: 2, make: () => new OAuth2SessionPruningTask() },
  { phase: 2, make: () => new ContextDeletionRunPruningTask() },
  { phase: 2, make: () => new AiDailyUsagePruningTask() },
  { phase: 2, make: () => new EmailActionPruningTask() },
  { phase: 2, make: () => new AuditLogPruningTask() },
  { phase: 2, make: () => new IntegrationDeliveryLogPruningTask() },
  { phase: 2, make: () => new ScheduledDigestTask() },
  { phase: 2, make: () => new SyncedCalendarEventPruningTask() },
  { phase: 2, make: () => new BackgroundTaskRunPruningTask() },
  { phase: 2, make: () => new ScheduledActionExecutionTask() },
];

function tasksForPhase(phase: CronPhase): IScheduledTask<IEnv>[] {
  return CRON_TASK_DEFINITIONS.filter((d) => d.phase === phase).map((d) => d.make());
}

export { CRON_TASK_DEFINITIONS, tasksForPhase };
export type { CronPhase, TaskDefinition };
