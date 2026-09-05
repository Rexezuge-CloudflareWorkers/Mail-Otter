import { apiFetch, apiGet } from '../lib/api';
import type { ActivityEntry, ActivityEventType } from '../types';

export type { ActionCreatedEntry, ActionExecutedEntry, ActivityEntry, ActivityEventType, EmailProcessedEntry } from '../types';

export async function loadActivity(options: {
  applicationId?: string;
  types?: ActivityEventType[];
  cursor?: string;
  limit?: number;
}): Promise<{ entries: ActivityEntry[]; nextCursor?: string }> {
  return apiGet<{ entries: ActivityEntry[]; nextCursor?: string }>('/user/activity', {
    applicationId: options.applicationId,
    cursor: options.cursor,
    limit: options.limit === undefined ? undefined : String(options.limit),
    types: options.types,
  });
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
