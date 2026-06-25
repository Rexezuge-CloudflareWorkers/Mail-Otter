import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { ActionStatusSyncUtil } from '@mail-otter/backend-services/digest';
import { BACKGROUND_TASK_TYPE_ACTION_STATUS_SYNC, DIGEST_CONFIG_KEY_ENABLED } from '@mail-otter/shared/constants';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class ActionStatusSyncTask extends IScheduledTask<ActionStatusSyncTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ActionStatusSyncTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const packageApiKey = ConfigurationManager.digest.getPackageTrackingApiKey(env);
    const flightApiKey = ConfigurationManager.digest.getFlightTrackingApiKey(env);
    if (!packageApiKey && !flightApiKey) return { itemsProcessed: 0, itemsFailed: 0 };

    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const actionKey: string = await env.ACTION_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    const applicationIds = await applicationDAO.listApplicationIdsWithProviderConfig(DIGEST_CONFIG_KEY_ENABLED, 'true');
    if (applicationIds.length === 0) return { itemsProcessed: 0, itemsFailed: 0 };

    const syncUtil = new ActionStatusSyncUtil(sessionEnv.DB, actionKey);
    let synced = 0;
    let failed = 0;
    for (const applicationId of applicationIds) {
      const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_ACTION_STATUS_SYNC, applicationId, sessionEnv.DB);
      try {
        if (packageApiKey) await syncUtil.syncPackageActions(applicationId, packageApiKey);
        if (flightApiKey) await syncUtil.syncFlightActions(applicationId, flightApiKey);
        synced++;
        await run.succeed({ itemsProcessed: 1, itemsFailed: 0, summary: 'Action statuses synced' });
      } catch (error: unknown) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ActionStatusSyncTask] Failed to sync action statuses for application ${applicationId}:`, error);
        await run.fail(message);
      }
    }
    console.log(`[ActionStatusSyncTask] Action status sync complete for ${applicationIds.length} applications`);
    return {
      itemsProcessed: synced,
      itemsFailed: failed,
      summary: `Synced ${synced} of ${applicationIds.length} mailboxes`,
    };
  }
}

interface ActionStatusSyncTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  PACKAGE_TRACKING_API_KEY?: string;
  FLIGHT_TRACKING_API_KEY?: string;
}

export { ActionStatusSyncTask };
