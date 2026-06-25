import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { CalendarEventSyncUtil } from '@mail-otter/backend-services/digest';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import {
  BACKGROUND_TASK_TYPE_CALENDAR_SYNC,
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  DIGEST_CALENDAR_SYNC_DAYS,
  DIGEST_CONFIG_KEY_ENABLED,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class CalendarEventSyncTask extends IScheduledTask<CalendarEventSyncTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: CalendarEventSyncTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    const applicationIds = await applicationDAO.listApplicationIdsWithProviderConfig(DIGEST_CONFIG_KEY_ENABLED, 'true');
    if (applicationIds.length === 0) return { itemsProcessed: 0, itemsFailed: 0 };

    const syncUtil = new CalendarEventSyncUtil(sessionEnv.DB);
    const now = new Date();
    const windowStartIso = now.toISOString();
    const windowEndIso = new Date(now.getTime() + DIGEST_CALENDAR_SYNC_DAYS * 86_400 * 1000).toISOString();

    let synced = 0;
    let failed = 0;
    for (const applicationId of applicationIds) {
      const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_CALENDAR_SYNC, applicationId, sessionEnv.DB);
      try {
        const application = await applicationDAO.getById(applicationId);
        if (!application || application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
          await run.skip('Application not connected');
          continue;
        }
        if (application.providerId !== PROVIDER_GOOGLE_GMAIL && application.providerId !== PROVIDER_MICROSOFT_OUTLOOK) {
          await run.skip('Provider does not support calendar sync');
          continue;
        }
        const hasCalendarFeature = application.enabledFeatures?.some((f) => f.includes('calendar')) ?? false;
        if (!hasCalendarFeature) {
          await run.skip('Calendar feature not enabled');
          continue;
        }

        const accessToken = await new OAuth2AccessTokenService(env).getAccessToken(applicationId);
        await syncUtil.syncForApplication(application, accessToken, windowStartIso, windowEndIso);
        synced++;
        await run.succeed({ itemsProcessed: 1, itemsFailed: 0, summary: 'Calendar events synced' });
      } catch (error: unknown) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[CalendarEventSyncTask] Failed to sync calendar for application ${applicationId}:`, error);
        await run.fail(message);
      }
    }
    console.log(`[CalendarEventSyncTask] Synced calendar events for ${synced}/${applicationIds.length} applications`);
    return {
      itemsProcessed: synced,
      itemsFailed: failed,
      summary: `Synced ${synced} of ${applicationIds.length} mailboxes`,
    };
  }
}

interface CalendarEventSyncTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { CalendarEventSyncTask };
