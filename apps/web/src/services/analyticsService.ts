import type { AnalyticsData } from '../types';
import { apiFetch, readJson } from '../../components/utils';

export async function loadAnalytics(days: number, applicationId?: string): Promise<AnalyticsData> {
  const p = new URLSearchParams({ days: String(days) });
  if (applicationId) p.set('applicationId', applicationId);
  return readJson<AnalyticsData>(await apiFetch(`/user/analytics?${p}`));
}
