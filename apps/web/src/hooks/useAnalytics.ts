import { useState } from 'react';
import type { AnalyticsData } from '../types';
import * as analyticsService from '../services/analyticsService';

interface UseAnalyticsOptions {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useAnalytics({ showNotice }: UseAnalyticsOptions) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30);
  const [analyticsApplicationId, setAnalyticsApplicationId] = useState('');

  const loadAnalytics = async (days = analyticsDays, applicationId = analyticsApplicationId) => {
    setAnalyticsLoading(true);
    try {
      const data = await analyticsService.loadAnalytics(days, applicationId || undefined);
      setAnalyticsData(data);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  return {
    analyticsData,
    analyticsLoading,
    analyticsDays,
    setAnalyticsDays,
    analyticsApplicationId,
    setAnalyticsApplicationId,
    loadAnalytics,
  };
}
