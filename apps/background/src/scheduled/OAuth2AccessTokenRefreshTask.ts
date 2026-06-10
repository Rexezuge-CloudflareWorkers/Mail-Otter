import { OAuth2AccessTokenRefreshStatusDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class OAuth2AccessTokenRefreshTask extends IScheduledTask<OAuth2AccessTokenRefreshTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: OAuth2AccessTokenRefreshTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const refreshWindowSeconds: number = ConfigurationManager.getOAuth2AccessTokenRefreshWindowSeconds(env);
    const batchSize: number = ConfigurationManager.getOAuth2TokenRefreshBatchSize(env);
    const refreshBefore: number = TimestampUtil.getCurrentUnixTimestampInSeconds() + refreshWindowSeconds;
    const sessionEnv = createD1SessionEnv(env);
    const statusDAO = new OAuth2AccessTokenRefreshStatusDAO(sessionEnv.DB);
    const applicationIds: string[] = await statusDAO.listDueApplicationIds(refreshBefore, batchSize);

    for (const applicationId of applicationIds) {
      try {
        await OAuth2AccessTokenService.refreshAccessToken(applicationId, env, { forceRefresh: true });
      } catch (error: unknown) {
        console.error(`Failed to refresh OAuth2 access token for application ${applicationId}:`, error);
      }
    }
  }
}

interface OAuth2AccessTokenRefreshTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS?: string | undefined;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
  OAUTH2_TOKEN_REFRESH_BATCH_SIZE?: string | undefined;
}

export { OAuth2AccessTokenRefreshTask };
