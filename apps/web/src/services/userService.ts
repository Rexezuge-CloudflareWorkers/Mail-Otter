import type { CurrentUser } from '../../components/types';
import { apiFetch, readJson, fetchDocumentAuditLogs } from '../../components/utils';

export async function loadCurrentUser(): Promise<CurrentUser> {
  return readJson<CurrentUser>(await apiFetch('/user/me'));
}

export { fetchDocumentAuditLogs };
