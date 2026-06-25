import { BackgroundTaskRunDAO, ConnectedApplicationDAO, ProcessedMessageDAO, SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import type {
  BackgroundTaskRunList,
  ListTaskRunsOptions,
  ListProcessedMessagesOptions,
  ListCalendarEventsOptions,
} from '@mail-otter/backend-data/dao';
import type { ProcessedMessageList, SyncedCalendarEventList } from '@mail-otter/shared/model';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { BadRequestError } from '@mail-otter/backend-errors';
import { ActionStatusSyncUtil, CalendarEventSyncUtil } from '../digest';
import { OAuth2AccessTokenService } from '../oauth2';
import { BACKGROUND_TASK_TYPE_ACTION_STATUS_SYNC, BACKGROUND_TASK_TYPE_CALENDAR_SYNC } from '@mail-otter/shared/constants';

interface ProcessingServiceEnv {
  DB: D1Queryable;
}

interface TriggerTaskEnv extends ProcessingServiceEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  PACKAGE_TRACKING_API_KEY?: string;
  FLIGHT_TRACKING_API_KEY?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

const ProcessingService = {
  async listTaskRuns(
    userEmail: string,
    options: Pick<ListTaskRunsOptions, 'taskType' | 'applicationId' | 'status' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<BackgroundTaskRunList> {
    const dao = new BackgroundTaskRunDAO(env.DB);
    return dao.listForUser(userEmail, {
      taskType: options.taskType,
      applicationId: options.applicationId,
      status: options.status,
      cursor: options.cursor,
    });
  },

  async listCalendarEvents(
    userEmail: string,
    options: Pick<ListCalendarEventsOptions, 'applicationId' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<SyncedCalendarEventList> {
    const dao = new SyncedCalendarEventDAO(env.DB);
    return dao.listForUser(userEmail, { applicationId: options.applicationId, cursor: options.cursor });
  },

  async listProcessedMessages(
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
  },

  async triggerTask(
    userEmail: string,
    taskType: string,
    applicationId: string,
    env: TriggerTaskEnv,
  ): Promise<void> {
    if (taskType !== BACKGROUND_TASK_TYPE_CALENDAR_SYNC && taskType !== BACKGROUND_TASK_TYPE_ACTION_STATUS_SYNC) {
      throw new BadRequestError(`Task type '${taskType}' cannot be triggered manually.`);
    }

    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new BadRequestError('Connected application not found.');

    if (taskType === BACKGROUND_TASK_TYPE_CALENDAR_SYNC) {
      const now = new Date();
      const windowStartIso = now.toISOString();
      const windowEndIso = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
      const accessToken = await new OAuth2AccessTokenService(env).getAccessToken(applicationId);
      const syncUtil = new CalendarEventSyncUtil(env.DB);
      await syncUtil.syncForApplication(application, accessToken, windowStartIso, windowEndIso);
    } else {
      const packageApiKey = ConfigurationManager.digest.getPackageTrackingApiKey(env);
      const flightApiKey = ConfigurationManager.digest.getFlightTrackingApiKey(env);
      const actionKey: string = await env.ACTION_ENCRYPTION_KEY_SECRET.get();
      const syncUtil = new ActionStatusSyncUtil(env.DB, actionKey);
      if (packageApiKey) await syncUtil.syncPackageActions(applicationId, packageApiKey);
      if (flightApiKey) await syncUtil.syncFlightActions(applicationId, flightApiKey);
    }
  },
};

export { ProcessingService };
export type { ProcessingServiceEnv, TriggerTaskEnv };
