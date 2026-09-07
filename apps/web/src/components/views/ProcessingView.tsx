
import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectedApplication } from '../../types';
import type {
  BackgroundTaskRun,
  BackgroundTaskRunStatus,
  ProcessedMessage,
  ProcessedMessageStatus,
  SyncedCalendarEvent,
} from '../../services/processingService';
import { getTaskTypeLabel, TRIGGERABLE_TASK_TYPES } from '../../services/processingService';
import { TaskRunStatusBadge, ProcessedMessageStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Select } from '../ui/Input';
import { FilterBar } from '../shared/FilterBar';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { MailboxSelect } from '../shared/MailboxSelect';
import { RefreshButton } from '../shared/RefreshButton';
import { appName } from '../../lib/applications';
import { formatDuration, formatTimestamp } from '../../lib/format';
import { cn } from '../../lib/utils';

function TaskRunRow({ run, applications }: { run: BackgroundTaskRun; applications: ConnectedApplication[] }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  return (
    <div className="flex flex-col gap-1 px-4 py-3 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-[var(--color-text-primary)] min-w-[140px]">
          {getTaskTypeLabel(run.taskType)}
        </span>
        <TaskRunStatusBadge status={run.status} />
        <span className="text-xs text-[var(--color-text-muted)]">{appName(run.applicationId, applications)}</span>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
          {t('processing.processedCount', '{{count}} processed', { count: run.itemsProcessed })}{run.itemsFailed > 0 ? t('processing.failedCount', ', {{count}} failed', { count: run.itemsFailed }) : ''}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">{formatDuration(run.startedAt, run.completedAt)}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{formatTimestamp(run.startedAt, lng)}</span>
      </div>
      {run.summary && (
        <p className="text-xs text-[var(--color-text-secondary)] pl-1">{run.summary}</p>
      )}
      {run.status === 'error' && run.errorMessage && (
        <p className="text-xs text-[var(--color-error-text)] pl-1 font-mono break-all">{run.errorMessage}</p>
      )}
    </div>
  );
}

function ProcessedMessageRow({ message, applications }: { message: ProcessedMessage; applications: ConnectedApplication[] }) {
  const { i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <ProcessedMessageStatusBadge status={message.status} />
      <span className="text-xs text-[var(--color-text-muted)]">{appName(message.applicationId, applications)}</span>
      <span className="text-xs font-mono text-[var(--color-text-muted)] truncate max-w-[180px]">
        {message.providerMessageId}
      </span>
      {message.status === 'error' && message.errorMessage && (
        <span className="text-xs text-[var(--color-error-text)] truncate max-w-[200px]">{message.errorMessage}</span>
      )}
      <span className="text-xs text-[var(--color-text-muted)] ml-auto">{formatTimestamp(message.createdAt, lng)}</span>
    </div>
  );
}

function CalendarEventRow({ event, applications }: { event: SyncedCalendarEvent; applications: ConnectedApplication[] }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--color-text-primary)] truncate flex-1">{event.eventTitle}</span>
        <span className="text-xs text-[var(--color-text-muted)] shrink-0">{formatTimestamp(event.startTime, lng)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">{appName(event.applicationId, applications)}</span>
        <span className="text-xs text-[var(--color-text-muted)]">·</span>
        <span className="text-xs text-[var(--color-text-muted)]">{t('processing.syncedAt', 'Synced {{date}}', { date: formatTimestamp(event.syncedAt, lng) })}</span>
      </div>
    </div>
  );
}

export function ProcessingView({
  applications,
  applicationId,
  setApplicationId,
  taskType,
  setTaskType,
  runStatus,
  setRunStatus,
  messageStatus,
  setMessageStatus,
  taskRuns,
  taskRunsCursor,
  taskRunsLoading,
  calendarEvents,
  calendarEventsCursor,
  calendarEventsLoading,
  processedMessages,
  processedMessagesCursor,
  processedMessagesLoading,
  onRefresh,
  onTriggerTaskRun,
  triggeringTask,
  onLoadMoreTaskRuns,
  onLoadMoreCalendarEvents,
  onLoadMoreProcessedMessages,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (id: string) => void;
  taskType: string;
  setTaskType: (t: string) => void;
  runStatus: BackgroundTaskRunStatus | '';
  setRunStatus: (s: BackgroundTaskRunStatus | '') => void;
  messageStatus: ProcessedMessageStatus | '';
  setMessageStatus: (s: ProcessedMessageStatus | '') => void;
  taskRuns: BackgroundTaskRun[];
  taskRunsCursor?: string;
  taskRunsLoading: boolean;
  calendarEvents: SyncedCalendarEvent[];
  calendarEventsCursor?: string;
  calendarEventsLoading: boolean;
  processedMessages: ProcessedMessage[];
  processedMessagesCursor?: string;
  processedMessagesLoading: boolean;
  onRefresh: () => void;
  onTriggerTaskRun: () => void;
  triggeringTask: boolean;
  onLoadMoreTaskRuns: () => void;
  onLoadMoreCalendarEvents: () => void;
  onLoadMoreProcessedMessages: () => void;
}) {
  const { t } = useTranslation();
  const TASK_TYPE_OPTIONS = [
    { value: '', label: t('processing.allTaskTypes', 'All Task Types') },
    { value: 'calendar_sync', label: t('processing.taskTypes.calendarSync', 'Calendar Sync') },
    { value: 'action_status_sync', label: t('processing.taskTypes.actionStatusSync', 'Action Status Sync') },
    { value: 'imap_polling', label: t('processing.taskTypes.imapPolling', 'IMAP Polling') },
    { value: 'scheduled_digest', label: t('processing.taskTypes.scheduledDigest', 'Scheduled Digest') },
    { value: 'oauth2_refresh', label: t('processing.taskTypes.oauth2Refresh', 'OAuth2 Token Refresh') },
  ];

  const RUN_STATUS_OPTIONS = [
    { value: '', label: t('actions.allStatuses', 'All Statuses') },
    { value: 'running', label: t('status.running', 'Running') },
    { value: 'success', label: t('status.success', 'Success') },
    { value: 'partial_success', label: t('processing.partialSuccess', 'Partial Success') },
    { value: 'error', label: t('status.error', 'Error') },
    { value: 'skipped', label: t('status.skipped', 'Skipped') },
  ];

  const MESSAGE_STATUS_OPTIONS = [
    { value: '', label: t('actions.allStatuses', 'All Statuses') },
    { value: 'summarized', label: t('status.summarized', 'Summarized') },
    { value: 'skipped', label: t('status.skipped', 'Skipped') },
    { value: 'error', label: t('status.error', 'Error') },
    { value: 'processing', label: t('status.processing', 'Processing') },
  ];

  const refreshing = taskRunsLoading || calendarEventsLoading || processedMessagesLoading;

  const handleRefresh = () => {
    onRefresh();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-6">
      <FilterBar>
        <MailboxSelect value={applicationId} onChange={setApplicationId} applications={applications} />
        <Select
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className="min-w-[160px]"
        >
          {TASK_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select
          value={runStatus}
          onChange={(e) => setRunStatus(e.target.value as BackgroundTaskRunStatus | '')}
          className="min-w-[140px]"
        >
          {RUN_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onClick={onTriggerTaskRun}
          disabled={triggeringTask || !(TRIGGERABLE_TASK_TYPES as readonly string[]).includes(taskType) || !applicationId}
        >
          <Play className="h-3.5 w-3.5" />
          {t('processing.runNow', 'Run Now')}
        </Button>
        <RefreshButton onRefresh={handleRefresh} loading={refreshing} className="ml-auto" />
      </FilterBar>

      {/* Background Task Runs — full width */}
      <Card>
        <CardHeader>
          <CardTitle>{t('processing.backgroundTaskRuns', 'Background Task Runs')}</CardTitle>
        </CardHeader>
        {taskRunsLoading && taskRuns.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('common.loading', 'Loading…')}</div>
        ) : taskRuns.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('processing.noTaskRunsFound', 'No Task Runs Found')}</div>
        ) : (
          <>
            {taskRuns.map((run) => (
              <TaskRunRow key={run.runId} run={run} applications={applications} />
            ))}
            {taskRunsCursor && (
              <LoadMoreButton onLoadMore={onLoadMoreTaskRuns} loading={taskRunsLoading} />
            )}
          </>
        )}
      </Card>

      {/* Bottom two-panel grid */}
      <div className={cn('grid gap-6', 'grid-cols-1 lg:grid-cols-[1fr_400px]')}>
        {/* Processed Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{t('processing.messages', 'Processed Messages')}</CardTitle>
            <Select
              value={messageStatus}
              onChange={(e) => setMessageStatus(e.target.value as ProcessedMessageStatus | '')}
              className="w-36 text-xs"
            >
              {MESSAGE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </CardHeader>
          {processedMessagesLoading && processedMessages.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('common.loading', 'Loading…')}</div>
          ) : processedMessages.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('processing.noMessagesFound', 'No Messages Found')}</div>
          ) : (
            <>
              {processedMessages.map((msg) => (
                <ProcessedMessageRow key={msg.processedMessageId} message={msg} applications={applications} />
              ))}
              {processedMessagesCursor && (
                <LoadMoreButton onLoadMore={onLoadMoreProcessedMessages} loading={processedMessagesLoading} />
              )}
            </>
          )}
        </Card>

        {/* Synced Calendar Events */}
        <Card>
          <CardHeader>
            <CardTitle>{t('processing.syncedCalendarEvents', 'Synced Calendar Events')}</CardTitle>
          </CardHeader>
          {calendarEventsLoading && calendarEvents.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('common.loading', 'Loading…')}</div>
          ) : calendarEvents.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('processing.noEventsFound', 'No Events Found')}</div>
          ) : (
            <>
              {calendarEvents.map((event) => (
                <CalendarEventRow key={event.syncEventId} event={event} applications={applications} />
              ))}
              {calendarEventsCursor && (
                <LoadMoreButton onLoadMore={onLoadMoreCalendarEvents} loading={calendarEventsLoading} />
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
