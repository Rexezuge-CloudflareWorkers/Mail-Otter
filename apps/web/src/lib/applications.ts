import type { ConnectedApplication } from '../types';

export function appName(applicationId: string | null | undefined, applications: ConnectedApplication[]): string {
  return applicationId ? applications.find((a) => a.applicationId === applicationId)?.displayName ?? applicationId : '—';
}
