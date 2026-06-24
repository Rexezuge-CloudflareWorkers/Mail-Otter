import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { CalendarEventSyncUtil } from '@mail-otter/backend-services/digest';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  DIGEST_CONFIG_KEY_ENABLED,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class CalendarEventSyncTask extends IScheduledTask<CalendarEventSyncTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: CalendarEventSyncTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    const applicationIds = await applicationDAO.listApplicationIdsWithProviderConfig(DIGEST_CONFIG_KEY_ENABLED, 'true');
    if (applicationIds.length === 0) return;

    const syncUtil = new CalendarEventSyncUtil(sessionEnv.DB);
    const now = new Date();
    const windowStartIso = now.toISOString();
    const windowEndIso = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();

    let synced = 0;
    for (const applicationId of applicationIds) {
      try {
        const application = await applicationDAO.getById(applicationId);
        if (!application || application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) continue;
        if (application.providerId !== PROVIDER_GOOGLE_GMAIL && application.providerId !== PROVIDER_MICROSOFT_OUTLOOK) continue;

        const hasCalendarFeature = application.enabledFeatures?.some((f) => f.includes('calendar')) ?? false;
        if (!hasCalendarFeature) continue;

        const accessToken = await new OAuth2AccessTokenService(env).getAccessToken(applicationId);
        await syncUtil.syncForApplication(application, accessToken, windowStartIso, windowEndIso);
        synced++;
      } catch (error: unknown) {
        console.error(`[CalendarEventSyncTask] Failed to sync calendar for application ${applicationId}:`, error);
      }
    }
    console.log(`[CalendarEventSyncTask] Synced calendar events for ${synced}/${applicationIds.length} applications`);
  }
}

interface CalendarEventSyncTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { CalendarEventSyncTask };
