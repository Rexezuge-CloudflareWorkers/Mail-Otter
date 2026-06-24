import { BackgroundTaskRunDAO, ProcessedMessageDAO, SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import type {
  BackgroundTaskRunList,
  BackgroundTaskRunStatus,
  ListTaskRunsOptions,
  ListProcessedMessagesOptions,
  ListCalendarEventsOptions,
} from '@mail-otter/backend-data/dao';
import type { ProcessedMessageList, SyncedCalendarEventList } from '@mail-otter/shared/model';
import type { D1Queryable } from '@mail-otter/backend-data/utils';

interface ProcessingServiceEnv {
  DB: D1Queryable;
}

class ProcessingService {
  static async listTaskRuns(
    userEmail: string,
    options: Pick<ListTaskRunsOptions, 'taskType' | 'applicationId' | 'status' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<BackgroundTaskRunList> {
    const dao = new BackgroundTaskRunDAO(env.DB);
    return dao.listForUser(userEmail, {
      taskType: options.taskType,
      applicationId: options.applicationId,
      status: options.status as BackgroundTaskRunStatus | undefined,
      cursor: options.cursor,
    });
  }

  static async listCalendarEvents(
    userEmail: string,
    options: Pick<ListCalendarEventsOptions, 'applicationId' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<SyncedCalendarEventList> {
    const dao = new SyncedCalendarEventDAO(env.DB);
    return dao.listForUser(userEmail, { applicationId: options.applicationId, cursor: options.cursor });
  }

  static async listProcessedMessages(
    userEmail: string,
    options: Pick<ListProcessedMessagesOptions, 'applicationId' | 'status' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<ProcessedMessageList> {
    const dao = new ProcessedMessageDAO(env.DB);
    return dao.listForUser(userEmail, {
      applicationId: options.applicationId,
      status: options.status,
      cursor: options.cursor,
    });
  }
}

export { ProcessingService };
export type { ProcessingServiceEnv };
