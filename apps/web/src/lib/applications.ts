import type { ConnectedApplication } from '../types';

export function appName(applicationId: string | null | undefined, applications: ConnectedApplication[]): string {
  if (!applicationId) return '—';
  return applications.find((a) => a.applicationId === applicationId)?.displayName ?? applicationId;
}
