import { useState } from 'react';
import * as processingService from '../services/processingService';
import type { BackgroundTaskRun, BackgroundTaskRunStatus, ProcessedMessage, ProcessedMessageStatus, SyncedCalendarEvent } from '../services/processingService';

interface UseProcessingOptions {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useProcessing({ showNotice }: UseProcessingOptions) {
  const [processingApplicationId, setProcessingApplicationId] = useState('');
  const [processingTaskType, setProcessingTaskType] = useState('');
  const [processingRunStatus, setProcessingRunStatus] = useState<BackgroundTaskRunStatus | ''>('');
  const [processingMessageStatus, setProcessingMessageStatus] = useState<ProcessedMessageStatus | ''>('');

  const [taskRuns, setTaskRuns] = useState<BackgroundTaskRun[]>([]);
  const [taskRunsCursor, setTaskRunsCursor] = useState<string | undefined>(undefined);
  const [taskRunsLoading, setTaskRunsLoading] = useState(false);

  const [calendarEvents, setCalendarEvents] = useState<SyncedCalendarEvent[]>([]);
  const [calendarEventsCursor, setCalendarEventsCursor] = useState<string | undefined>(undefined);
  const [calendarEventsLoading, setCalendarEventsLoading] = useState(false);

  const [processedMessages, setProcessedMessages] = useState<ProcessedMessage[]>([]);
  const [processedMessagesCursor, setProcessedMessagesCursor] = useState<string | undefined>(undefined);
  const [processedMessagesLoading, setProcessedMessagesLoading] = useState(false);

  const loadTaskRuns = async (append = false, cursor?: string) => {
    setTaskRunsLoading(true);
    try {
      const result = await processingService.loadTaskRuns({
        taskType: processingTaskType || undefined,
        applicationId: processingApplicationId || undefined,
        status: processingRunStatus || undefined,
        cursor,
      });
      setTaskRuns(append ? (prev) => [...prev, ...result.runs] : result.runs);
      setTaskRunsCursor(result.nextCursor);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Task Runs.');
    } finally {
      setTaskRunsLoading(false);
    }
  };

  const loadCalendarEvents = async (append = false, cursor?: string) => {
    setCalendarEventsLoading(true);
    try {
      const result = await processingService.loadCalendarEvents({
        applicationId: processingApplicationId || undefined,
        cursor,
      });
      setCalendarEvents(append ? (prev) => [...prev, ...result.events] : result.events);
      setCalendarEventsCursor(result.nextCursor);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Calendar Events.');
    } finally {
      setCalendarEventsLoading(false);
    }
  };

  const loadProcessedMessages = async (append = false, cursor?: string) => {
    setProcessedMessagesLoading(true);
    try {
      const result = await processingService.loadProcessedMessages({
        applicationId: processingApplicationId || undefined,
        status: processingMessageStatus || undefined,
        cursor,
      });
      setProcessedMessages(append ? (prev) => [...prev, ...result.messages] : result.messages);
      setProcessedMessagesCursor(result.nextCursor);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Processed Messages.');
    } finally {
      setProcessedMessagesLoading(false);
    }
  };

  const loadProcessing = async () => {
    await Promise.all([loadTaskRuns(), loadCalendarEvents(), loadProcessedMessages()]);
  };

  return {
    processingApplicationId,
    setProcessingApplicationId,
    processingTaskType,
    setProcessingTaskType,
    processingRunStatus,
    setProcessingRunStatus,
    processingMessageStatus,
    setProcessingMessageStatus,

    taskRuns,
    taskRunsCursor,
    taskRunsLoading,
    loadTaskRuns,

    calendarEvents,
    calendarEventsCursor,
    calendarEventsLoading,
    loadCalendarEvents,

    processedMessages,
    processedMessagesCursor,
    processedMessagesLoading,
    loadProcessedMessages,

    loadProcessing,
  };
}
