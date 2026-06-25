import { OAuth2AccessTokenRefreshStatusDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import { BACKGROUND_TASK_TYPE_OAUTH2_REFRESH } from '@mail-otter/shared/constants';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class OAuth2AccessTokenRefreshTask extends IScheduledTask<OAuth2AccessTokenRefreshTaskEnv> {
  protected getTaskType(): string {
    return BACKGROUND_TASK_TYPE_OAUTH2_REFRESH;
  }

  protected async handleScheduledTask(
    _event: ScheduledController,
    env: OAuth2AccessTokenRefreshTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const refreshWindowSeconds: number = ConfigurationManager.getOAuth2AccessTokenRefreshWindowSeconds(env);
    const batchSize: number = ConfigurationManager.getOAuth2TokenRefreshBatchSize(env);
    const refreshBefore: number = TimestampUtil.getCurrentUnixTimestampInSeconds() + refreshWindowSeconds;
    const sessionEnv = createD1SessionEnv(env);
    const statusDAO = new OAuth2AccessTokenRefreshStatusDAO(sessionEnv.DB);
    const applicationIds: string[] = await statusDAO.listDueApplicationIds(refreshBefore, batchSize);

    let refreshed = 0;
    let failed = 0;
    for (const applicationId of applicationIds) {
      try {
        await new OAuth2AccessTokenService(env).refreshAccessToken(applicationId, { forceRefresh: true });
        refreshed++;
      } catch (error: unknown) {
        failed++;
        console.error(`Failed to refresh OAuth2 access token for application ${applicationId}:`, error);
      }
    }
    return {
      itemsProcessed: refreshed,
      itemsFailed: failed,
      summary: `Refreshed ${refreshed} of ${applicationIds.length} tokens`,
    };
  }
}

interface OAuth2AccessTokenRefreshTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OAUTH2_TOKEN_REFRESH_BATCH_SIZE?: string;
}

export { OAuth2AccessTokenRefreshTask };
