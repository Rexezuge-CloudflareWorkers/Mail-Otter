import { useState } from 'react';
import * as activityService from '../services/activityService';
import type { ActivityEntry, ActivityEventType } from '../services/activityService';

interface UseActivityOptions {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useActivity({ showNotice }: UseActivityOptions) {
  const [activityApplicationId, setActivityApplicationId] = useState('');
  const [activityEventTypes, setActivityEventTypes] = useState<ActivityEventType[]>([]);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | undefined>(undefined);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityExporting, setActivityExporting] = useState(false);

  const loadActivity = async (append = false, cursor?: string) => {
    setActivityLoading(true);
    try {
      const result = await activityService.loadActivity({
        applicationId: activityApplicationId || undefined,
        types: activityEventTypes.length > 0 ? activityEventTypes : undefined,
        cursor,
      });
      setEntries(append ? (prev) => [...prev, ...result.entries] : result.entries);
      setActivityCursor(result.nextCursor);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Activity.');
    } finally {
      setActivityLoading(false);
    }
  };

  const exportCsv = async () => {
    setActivityExporting(true);
    try {
      await activityService.exportActivityCsv({
        applicationId: activityApplicationId || undefined,
        types: activityEventTypes.length > 0 ? activityEventTypes : undefined,
      });
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Export Activity.');
    } finally {
      setActivityExporting(false);
    }
  };

  return {
    activityApplicationId,
    setActivityApplicationId,
    activityEventTypes,
    setActivityEventTypes,
    entries,
    activityCursor,
    activityLoading,
    activityExporting,
    loadActivity,
    exportCsv,
  };
}
