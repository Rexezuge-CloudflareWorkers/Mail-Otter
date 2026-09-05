import type { CurrentUser } from '../types';
import { apiGet } from '../lib/api';

export async function loadCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>('/user/me');
}

export { fetchDocumentAuditLogs } from '../lib/api';
