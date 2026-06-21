import type { EmailAction, EmailActionExecution, EmailActionStatus } from '../../components/types';
import { apiFetch, readJson } from '../../components/utils';

export async function loadActions(
  applicationId: string,
  status: EmailActionStatus | '',
  cursor?: string,
): Promise<{ actions: EmailAction[]; nextCursor?: string }> {
  const p = new URLSearchParams();
  if (applicationId) p.set('applicationId', applicationId);
  if (status) p.set('status', status);
  if (cursor) p.set('cursor', cursor);
  return readJson<{ actions: EmailAction[]; nextCursor?: string }>(await apiFetch(`/user/actions?${p}`));
}

export async function loadActionExecutions(actionId: string): Promise<{ executions: EmailActionExecution[] }> {
  return readJson<{ executions: EmailActionExecution[] }>(
    await apiFetch(`/user/actions/${encodeURIComponent(actionId)}/executions`),
  );
}

export async function executeAction(actionId: string): Promise<{ action: EmailAction }> {
  return readJson<{ action: EmailAction }>(
    await apiFetch(`/user/actions/${encodeURIComponent(actionId)}/execute`, { method: 'POST' }),
  );
}
