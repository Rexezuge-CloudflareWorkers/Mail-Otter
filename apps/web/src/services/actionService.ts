import type { EmailAction, EmailActionExecution, EmailActionStatus } from '../types';
import { apiGet, apiPost } from '../lib/api';

function actionQuery(
  applicationId: string,
  status: EmailActionStatus | '',
  cursor?: string,
  showSnoozed?: boolean,
): Record<string, string | undefined> {
  return {
    applicationId: applicationId || undefined,
    status: status || undefined,
    cursor,
    showSnoozed: showSnoozed ? 'true' : undefined,
  };
}

export async function loadActions(
  applicationId: string,
  status: EmailActionStatus | '',
  cursor?: string,
  showSnoozed?: boolean,
): Promise<{ actions: EmailAction[]; nextCursor?: string }> {
  return apiGet<{ actions: EmailAction[]; nextCursor?: string }>(
    '/user/actions',
    actionQuery(applicationId, status, cursor, showSnoozed),
  );
}

export async function loadActionExecutions(actionId: string): Promise<{ executions: EmailActionExecution[] }> {
  return apiGet<{ executions: EmailActionExecution[] }>(
    `/user/actions/${encodeURIComponent(actionId)}/executions`,
  );
}

export async function executeAction(actionId: string): Promise<{ action: EmailAction }> {
  return apiPost<{ action: EmailAction }>(`/user/actions/${encodeURIComponent(actionId)}/execute`, {});
}

export async function snoozeAction(actionId: string, snoozedUntil: string | null): Promise<{ action: EmailAction }> {
  return apiPost<{ action: EmailAction }>(`/user/actions/${encodeURIComponent(actionId)}/snooze`, {
    snoozedUntil,
  });
}

export async function scheduleAction(actionId: string, scheduledFor: string | null): Promise<{ action: EmailAction }> {
  return apiPost<{ action: EmailAction }>(`/user/actions/${encodeURIComponent(actionId)}/schedule`, {
    scheduledFor,
  });
}
