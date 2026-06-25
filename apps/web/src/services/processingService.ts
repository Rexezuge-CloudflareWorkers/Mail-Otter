import { apiFetch, readJson } from '../../components/utils';

export const TRIGGERABLE_TASK_TYPES = ['calendar_sync', 'action_status_sync'] as const;

export type BackgroundTaskRunStatus = 'running' | 'success' | 'partial_success' | 'error' | 'skipped';
export type ProcessedMessageStatus = 'processing' | 'summarized' | 'skipped' | 'error';

export interface BackgroundTaskRun {
  runId: string;
  taskType: string;
  applicationId: string | null;
  status: BackgroundTaskRunStatus;
  itemsProcessed: number;
  itemsFailed: number;
  summary: string | null;
  details: unknown;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
  createdAt: number;
}

export interface ProcessedMessage {
  processedMessageId: string;
  applicationId: string;
  providerId: string;
  providerMessageId: string;
  providerThreadId?: string | null;
  status: ProcessedMessageStatus;
  errorMessage?: string | null;
  summarySentAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SyncedCalendarEvent {
  syncEventId: string;
  applicationId: string;
  providerEventId: string;
  eventTitle: string;
  startTime: number;
  endTime: number;
  timeZone: string;
  location?: string | null;
  notes?: string | null;
  syncedAt: number;
}

export const TASK_TYPE_LABELS: Record<string, string> = {
  calendar_sync: 'Calendar Sync',
  action_status_sync: 'Action Status Sync',
  imap_polling: 'IMAP Polling',
  scheduled_digest: 'Scheduled Digest',
  oauth2_refresh: 'OAuth2 Token Refresh',
};

export function getTaskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABELS[taskType] ?? taskType;
}

export async function loadTaskRuns(options: {
  taskType?: string;
  applicationId?: string;
  status?: string;
  cursor?: string;
}): Promise<{ runs: BackgroundTaskRun[]; nextCursor?: string }> {
  const p = new URLSearchParams();
  if (options.taskType) p.set('taskType', options.taskType);
  if (options.applicationId) p.set('applicationId', options.applicationId);
  if (options.status) p.set('status', options.status);
  if (options.cursor) p.set('cursor', options.cursor);
  const qs = p.toString();
  return readJson<{ runs: BackgroundTaskRun[]; nextCursor?: string }>(
    await apiFetch(`/user/processing/task-runs${qs ? `?${qs}` : ''}`),
  );
}

export async function loadCalendarEvents(options: {
  applicationId?: string;
  cursor?: string;
}): Promise<{ events: SyncedCalendarEvent[]; nextCursor?: string }> {
  const p = new URLSearchParams();
  if (options.applicationId) p.set('applicationId', options.applicationId);
  if (options.cursor) p.set('cursor', options.cursor);
  const qs = p.toString();
  return readJson<{ events: SyncedCalendarEvent[]; nextCursor?: string }>(
    await apiFetch(`/user/processing/calendar-events${qs ? `?${qs}` : ''}`),
  );
}

export async function triggerTaskRun(taskType: string, applicationId: string): Promise<void> {
  const response = await apiFetch('/user/processing/run-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskType, applicationId }),
  });
  await readJson(response);
}

export async function loadProcessedMessages(options: {
  applicationId?: string;
  status?: string;
  cursor?: string;
}): Promise<{ messages: ProcessedMessage[]; nextCursor?: string }> {
  const p = new URLSearchParams();
  if (options.applicationId) p.set('applicationId', options.applicationId);
  if (options.status) p.set('status', options.status);
  if (options.cursor) p.set('cursor', options.cursor);
  const qs = p.toString();
  return readJson<{ messages: ProcessedMessage[]; nextCursor?: string }>(
    await apiFetch(`/user/processing/messages${qs ? `?${qs}` : ''}`),
  );
}
