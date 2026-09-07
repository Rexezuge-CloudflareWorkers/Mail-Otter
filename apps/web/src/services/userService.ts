import type { CurrentUser } from '../types';
import { apiGet, apiPut } from '../lib/api';

export async function loadCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>('/user/me');
}

export async function updatePreferredLanguage(preferredLanguage: string): Promise<CurrentUser> {
  return apiPut<CurrentUser>('/user/me', { preferredLanguage });
}

export { fetchDocumentAuditLogs } from '../lib/api';
