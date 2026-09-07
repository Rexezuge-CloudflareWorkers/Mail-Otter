import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { CONNECTED_APPLICATION_STATUS_CONNECTED } from '@mail-otter/shared/constants';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';
import type { DriveIngestionResult } from '@mail-otter/backend-services/drive';

interface DriveSyncConfig {
  taskType: string;
  featureFlag: string;
  expectedProviderId: string;
  unsupportedProviderMessage: string;
  noun: string;
}

interface BaseDriveSyncTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: VectorizeIndex;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  MAX_ATTACHMENT_SIZE_BYTES?: string;
  MAX_DRIVE_FILES_PER_SYNC?: string;
  AI_EMBEDDING_MODEL?: string;
  MAX_CONTEXT_MEMORY_CHARS?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
}

// Template Method for per-mailbox drive sync cron tasks.
// Eliminates ~75 LOC duplicated between GoogleDriveSyncTask and OneDriveSyncTask.
abstract class BaseDriveSyncTask<TEnv extends BaseDriveSyncTaskEnv> extends IScheduledTask<TEnv> {
  protected abstract config(): DriveSyncConfig;

  protected abstract ingestForApplication(
    env: TEnv,
    application: ConnectedApplication,
    accessToken: string,
  ): Promise<DriveIngestionResult>;

  protected async handleScheduledTask(
    _event: ScheduledController,
    env: TEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const { taskType, featureFlag, expectedProviderId, unsupportedProviderMessage, noun } = this.config();
    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    const applicationIds = await applicationDAO.listApplicationIdsWithFeatureEnabled(featureFlag);
    if (applicationIds.length === 0) return { itemsProcessed: 0, itemsFailed: 0 };

    let synced = 0;
    let failed = 0;

    for (const applicationId of applicationIds) {
      const run = await this.createApplicationRun(taskType, applicationId, sessionEnv.DB);
      try {
        const application = await applicationDAO.getById(applicationId);
        if (!application || application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
          await run.skip('Application not connected');
          continue;
        }
        if (application.providerId !== expectedProviderId) {
          await run.skip(unsupportedProviderMessage);
          continue;
        }

        const accessToken = await new OAuth2AccessTokenService(env).getAccessToken(applicationId);
        const result = await this.ingestForApplication(env, application, accessToken);

        synced++;
        await run.succeed({
          itemsProcessed: result.indexed + result.skipped,
          itemsFailed: result.failed,
          summary: `Indexed ${result.indexed}, skipped ${result.skipped}, failed ${result.failed}`,
        });
      } catch (error: unknown) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${this.constructor.name}] Failed for application ${applicationId}:`, error);
        await run.fail(message);
      }
    }

    console.log(`[${this.constructor.name}] Completed for ${synced}/${applicationIds.length} applications`);
    return {
      itemsProcessed: synced,
      itemsFailed: failed,
      summary: `Synced ${synced} of ${applicationIds.length} ${noun} connections`,
    };
  }
}

export { BaseDriveSyncTask };
export type { BaseDriveSyncTaskEnv, DriveSyncConfig };
