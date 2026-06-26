import { apiFetch, readJson } from '../../components/utils';

export type ActivityEventType = 'email_processed' | 'action_created' | 'action_executed';

export interface EmailProcessedEntry {
  eventType: 'email_processed';
  applicationId: string;
  providerMessageId: string;
  status: 'processing' | 'summarized' | 'skipped' | 'error';
  errorMessage?: string | null;
  timestamp: number;
}

export interface ActionCreatedEntry {
  eventType: 'action_created';
  applicationId: string;
  actionId: string;
  actionType: string;
  riskLevel: string;
  timestamp: number;
}

export interface ActionExecutedEntry {
  eventType: 'action_executed';
  applicationId: string;
  actionId: string;
  actionType: string;
  executionStatus: string;
  triggeredBy: string;
  timestamp: number;
}

export type ActivityEntry = EmailProcessedEntry | ActionCreatedEntry | ActionExecutedEntry;

export async function loadActivity(options: {
  applicationId?: string;
  types?: ActivityEventType[];
  cursor?: string;
  limit?: number;
}): Promise<{ entries: ActivityEntry[]; nextCursor?: string }> {
  const p = new URLSearchParams();
  if (options.applicationId) p.set('applicationId', options.applicationId);
  if (options.cursor) p.set('cursor', options.cursor);
  if (options.limit) p.set('limit', String(options.limit));
  if (options.types) {
    for (const t of options.types) p.append('types', t);
  }
  const qs = p.toString();
  return readJson<{ entries: ActivityEntry[]; nextCursor?: string }>(
    await apiFetch(`/user/activity${qs ? `?${qs}` : ''}`),
  );
}

export async function exportActivityCsv(options: {
  applicationId?: string;
  types?: ActivityEventType[];
}): Promise<void> {
  const p = new URLSearchParams();
  p.set('format', 'csv');
  if (options.applicationId) p.set('applicationId', options.applicationId);
  if (options.types) {
    for (const t of options.types) p.append('types', t);
  }
  const response = await apiFetch(`/user/activity?${p.toString()}`);
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'activity-export.csv' });
  a.click();
  URL.revokeObjectURL(url);
}
