import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { ActionStatusSyncUtil } from '@mail-otter/backend-services/digest';
import { DIGEST_CONFIG_KEY_ENABLED } from '@mail-otter/shared/constants';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class ActionStatusSyncTask extends IScheduledTask<ActionStatusSyncTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ActionStatusSyncTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const packageApiKey = ConfigurationManager.digest.getPackageTrackingApiKey(env);
    const flightApiKey = ConfigurationManager.digest.getFlightTrackingApiKey(env);
    if (!packageApiKey && !flightApiKey) return;

    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const actionKey: string = await env.ACTION_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    const applicationIds = await applicationDAO.listApplicationIdsWithProviderConfig(DIGEST_CONFIG_KEY_ENABLED, 'true');
    if (applicationIds.length === 0) return;

    const syncUtil = new ActionStatusSyncUtil(sessionEnv.DB, actionKey);
    for (const applicationId of applicationIds) {
      try {
        if (packageApiKey) await syncUtil.syncPackageActions(applicationId, packageApiKey);
        if (flightApiKey) await syncUtil.syncFlightActions(applicationId, flightApiKey);
      } catch (error: unknown) {
        console.error(`[ActionStatusSyncTask] Failed to sync action statuses for application ${applicationId}:`, error);
      }
    }
    console.log(`[ActionStatusSyncTask] Action status sync complete for ${applicationIds.length} applications`);
  }
}

interface ActionStatusSyncTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  PACKAGE_TRACKING_API_KEY?: string | undefined;
  FLIGHT_TRACKING_API_KEY?: string | undefined;
}

export { ActionStatusSyncTask };
