import { RefreshCw, ChevronDown, Play } from 'lucide-react';
import type { ConnectedApplication } from '../../../components/types';
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
import { formatTimestamp } from '../../../components/utils';
import { cn } from '../../lib/utils';

const TASK_TYPE_OPTIONS = [
  { value: '', label: 'All Task Types' },
  { value: 'calendar_sync', label: 'Calendar Sync' },
  { value: 'action_status_sync', label: 'Action Status Sync' },
  { value: 'imap_polling', label: 'IMAP Polling' },
  { value: 'scheduled_digest', label: 'Scheduled Digest' },
  { value: 'oauth2_refresh', label: 'OAuth2 Token Refresh' },
];

const RUN_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'running', label: 'Running' },
  { value: 'success', label: 'Success' },
  { value: 'partial_success', label: 'Partial Success' },
  { value: 'error', label: 'Error' },
  { value: 'skipped', label: 'Skipped' },
];

const MESSAGE_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'summarized', label: 'Summarized' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'error', label: 'Error' },
  { value: 'processing', label: 'Processing' },
];

function formatDuration(startedAt: number, completedAt: number | null): string {
  if (!completedAt) return '—';
  const ms = (completedAt - startedAt) * 1000;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function appName(applicationId: string | null, applications: ConnectedApplication[]): string {
  if (!applicationId) return '—';
  return applications.find((a) => a.applicationId === applicationId)?.displayName ?? applicationId;
}

function TaskRunRow({ run, applications }: { run: BackgroundTaskRun; applications: ConnectedApplication[] }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-[var(--color-text-primary)] min-w-[140px]">
          {getTaskTypeLabel(run.taskType)}
        </span>
        <TaskRunStatusBadge status={run.status} />
        <span className="text-xs text-[var(--color-text-muted)]">{appName(run.applicationId, applications)}</span>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
          {run.itemsProcessed} processed{run.itemsFailed > 0 ? `, ${run.itemsFailed} failed` : ''}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">{formatDuration(run.startedAt, run.completedAt)}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{formatTimestamp(run.startedAt)}</span>
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
      <span className="text-xs text-[var(--color-text-muted)] ml-auto">{formatTimestamp(message.createdAt)}</span>
    </div>
  );
}

function CalendarEventRow({ event, applications }: { event: SyncedCalendarEvent; applications: ConnectedApplication[] }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--color-text-primary)] truncate flex-1">{event.eventTitle}</span>
        <span className="text-xs text-[var(--color-text-muted)] shrink-0">{formatTimestamp(event.startTime)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">{appName(event.applicationId, applications)}</span>
        <span className="text-xs text-[var(--color-text-muted)]">·</span>
        <span className="text-xs text-[var(--color-text-muted)]">Synced {formatTimestamp(event.syncedAt)}</span>
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
  return (
    <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-6">
      <FilterBar>
        <Select
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
          className="min-w-[180px]"
        >
          <option value="">All Mailboxes</option>
          {applications.map((a) => (
            <option key={a.applicationId} value={a.applicationId}>{a.displayName}</option>
          ))}
        </Select>
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
          Run Now
        </Button>
        <Button variant="secondary" size="sm" onClick={onRefresh} className="ml-auto">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </FilterBar>

      {/* Background Task Runs — full width */}
      <Card>
        <CardHeader>
          <CardTitle>Background Task Runs</CardTitle>
        </CardHeader>
        {taskRunsLoading && taskRuns.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">Loading…</div>
        ) : taskRuns.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">No Task Runs Found</div>
        ) : (
          <>
            {taskRuns.map((run) => (
              <TaskRunRow key={run.runId} run={run} applications={applications} />
            ))}
            {taskRunsCursor && (
              <div className="flex justify-center py-3">
                <Button variant="ghost" size="sm" onClick={onLoadMoreTaskRuns} disabled={taskRunsLoading}>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Bottom two-panel grid */}
      <div className={cn('grid gap-6', 'grid-cols-1 lg:grid-cols-[1fr_400px]')}>
        {/* Processed Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Processed Messages</CardTitle>
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
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">Loading…</div>
          ) : processedMessages.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">No Messages Found</div>
          ) : (
            <>
              {processedMessages.map((msg) => (
                <ProcessedMessageRow key={msg.processedMessageId} message={msg} applications={applications} />
              ))}
              {processedMessagesCursor && (
                <div className="flex justify-center py-3">
                  <Button variant="ghost" size="sm" onClick={onLoadMoreProcessedMessages} disabled={processedMessagesLoading}>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Synced Calendar Events */}
        <Card>
          <CardHeader>
            <CardTitle>Synced Calendar Events</CardTitle>
          </CardHeader>
          {calendarEventsLoading && calendarEvents.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">Loading…</div>
          ) : calendarEvents.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">No Events Found</div>
          ) : (
            <>
              {calendarEvents.map((event) => (
                <CalendarEventRow key={event.syncEventId} event={event} applications={applications} />
              ))}
              {calendarEventsCursor && (
                <div className="flex justify-center py-3">
                  <Button variant="ghost" size="sm" onClick={onLoadMoreCalendarEvents} disabled={calendarEventsLoading}>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
