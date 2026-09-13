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
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';
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

interface TrackingConfig {
  getPackageTrackingApiKey(): string;
  getFlightTrackingApiKey(): string;
}

interface ProcessingServiceDeps {
  taskRunDAO?: () => Promise<BackgroundTaskRunDAO>;
  calendarEventDAO?: () => Promise<SyncedCalendarEventDAO>;
  processedMessageDAO?: () => Promise<ProcessedMessageDAO>;
  applicationDAO?: (masterKey: string) => Promise<ConnectedApplicationDAO>;
  tokenService?: (env: TriggerTaskEnv) => OAuth2AccessTokenService;
  config?: (env: unknown) => TrackingConfig;
}

/**
 * Injectable instance service for background task visibility + manual triggers.
 *
 * Static methods remain as a thin facade delegating to a default instance for
 * backward compatibility. New code should resolve via `Tokens.ProcessingService`
 * (`scope.get(...)`) and call the instance methods.
 */
class ProcessingService {
  private readonly deps: Required<ProcessingServiceDeps>;

  constructor(
    private readonly env: ProcessingServiceEnv,
    deps: ProcessingServiceDeps = {},
  ) {
    const db = env.DB;
    this.deps = {
      taskRunDAO: () => Promise.resolve(new BackgroundTaskRunDAO(db)),
      calendarEventDAO: () => Promise.resolve(new SyncedCalendarEventDAO(db)),
      processedMessageDAO: () => Promise.resolve(new ProcessedMessageDAO(db)),
      applicationDAO: (masterKey: string) => Promise.resolve(new ConnectedApplicationDAO(db, masterKey)),
      tokenService: (e: TriggerTaskEnv) => new OAuth2AccessTokenService(e),
      // Default reads via ConfigurationManager so existing module mocks keep
      // working; new code may inject `AppConfiguration.fromEnv(env)` instead
      // (it satisfies the same structural `TrackingConfig` interface).
      config: (e: unknown) => ({
        getPackageTrackingApiKey: () => ConfigurationManager.digest.getPackageTrackingApiKey(e),
        getFlightTrackingApiKey: () => ConfigurationManager.digest.getFlightTrackingApiKey(e),
      }),
      ...deps,
    };
  }

  // ─── Static facade (backward compatible) ───

  public static async listTaskRuns(
    userEmail: string,
    options: Pick<ListTaskRunsOptions, 'taskType' | 'applicationId' | 'status' | 'cursor' | 'latestPerType'>,
    env: ProcessingServiceEnv,
  ): Promise<BackgroundTaskRunList> {
    return new ProcessingService(env).listTaskRuns(userEmail, options);
  }

  public static async listCalendarEvents(
    userEmail: string,
    options: Pick<ListCalendarEventsOptions, 'applicationId' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<SyncedCalendarEventList> {
    return new ProcessingService(env).listCalendarEvents(userEmail, options);
  }

  public static async listProcessedMessages(
    userEmail: string,
    options: Pick<ListProcessedMessagesOptions, 'applicationId' | 'status' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<ProcessedMessageList> {
    return new ProcessingService(env).listProcessedMessages(userEmail, options);
  }

  public static async triggerTask(
    userEmail: string,
    taskType: string,
    applicationId: string,
    env: TriggerTaskEnv,
  ): Promise<void> {
    return new ProcessingService(env).triggerTask(userEmail, taskType, applicationId, env);
  }

  // ─── Instance API (prefer in new code) ───

  public async listTaskRuns(
    userEmail: string,
    options: Pick<ListTaskRunsOptions, 'taskType' | 'applicationId' | 'status' | 'cursor' | 'latestPerType'>,
  ): Promise<BackgroundTaskRunList> {
    const dao = await this.deps.taskRunDAO();
    return dao.listForUser(userEmail, {
      taskType: options.taskType,
      applicationId: options.applicationId,
      status: options.status,
      cursor: options.cursor,
      latestPerType: !options.taskType,
    });
  }

  public async listCalendarEvents(
    userEmail: string,
    options: Pick<ListCalendarEventsOptions, 'applicationId' | 'cursor'>,
  ): Promise<SyncedCalendarEventList> {
    const dao = await this.deps.calendarEventDAO();
    return dao.listForUser(userEmail, { applicationId: options.applicationId, cursor: options.cursor });
  }

  public async listProcessedMessages(
    userEmail: string,
    options: Pick<ListProcessedMessagesOptions, 'applicationId' | 'status' | 'cursor'>,
  ): Promise<ProcessedMessageList> {
    const dao = await this.deps.processedMessageDAO();
    return dao.listForUser(userEmail, {
      applicationId: options.applicationId,
      status: options.status,
      cursor: options.cursor,
    });
  }

  public async triggerTask(userEmail: string, taskType: string, applicationId: string, env: TriggerTaskEnv): Promise<void> {
    if (taskType !== BACKGROUND_TASK_TYPE_CALENDAR_SYNC && taskType !== BACKGROUND_TASK_TYPE_ACTION_STATUS_SYNC) {
      throw new BadRequestError(`Task type '${taskType}' cannot be triggered manually.`);
    }

    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = await this.deps.applicationDAO(masterKey);
    const application = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new NotFoundError('Connected application not found.');

    if (taskType === BACKGROUND_TASK_TYPE_CALENDAR_SYNC) {
      const now = new Date();
      const windowStartIso = now.toISOString();
      const windowEndIso = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
      const accessToken = await this.deps.tokenService(env).getAccessToken(applicationId);
      const syncUtil = new CalendarEventSyncUtil(env.DB);
      await syncUtil.syncForApplication(application, accessToken, windowStartIso, windowEndIso);
    } else {
      const config = this.deps.config(env);
      const packageApiKey = config.getPackageTrackingApiKey();
      const flightApiKey = config.getFlightTrackingApiKey();
      const actionKey: string = await env.ACTION_ENCRYPTION_KEY_SECRET.get();
      const syncUtil = new ActionStatusSyncUtil(env.DB, actionKey);
      if (packageApiKey) await syncUtil.syncPackageActions(applicationId, packageApiKey);
      if (flightApiKey) await syncUtil.syncFlightActions(applicationId, flightApiKey);
    }
  }
}

export { ProcessingService };
export type { ProcessingServiceDeps, ProcessingServiceEnv, TriggerTaskEnv };
