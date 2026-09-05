import type { AnalyticsData } from '../types';
import { apiGet } from '../lib/api';

export async function loadAnalytics(days: number, applicationId?: string): Promise<AnalyticsData> {
  return apiGet<AnalyticsData>('/user/analytics', {
    days: String(days),
    applicationId,
  });
}
