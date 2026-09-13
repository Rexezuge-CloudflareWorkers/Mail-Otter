import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { DigestConfigService, DigestService } from '@mail-otter/backend-services/digest';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';
import { EmailProviderRegistry } from '@mail-otter/backend-services/provider';
import type { InjectableEmailProviderRegistry } from '@mail-otter/backend-services/provider';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import {
  BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST,
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  DIGEST_CONFIG_KEY_ENABLED,
} from '@mail-otter/shared/constants';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class ScheduledDigestTask extends IScheduledTask<ScheduledDigestTaskEnv> {
  private static supportsDigestEmail(providerId: string, connectionMethod?: string): boolean {
    try {
      const provider = EmailProviderRegistry.get(providerId, connectionMethod);
      return typeof provider.sendDigestEmail === 'function';
    } catch {
      return false;
    }
  }

  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ScheduledDigestTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const sessionEnv = createD1SessionEnv(env);
    const scope = createRequestScope(sessionEnv);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    const applicationIds = await applicationDAO.listApplicationIdsWithProviderConfig(DIGEST_CONFIG_KEY_ENABLED, 'true');
    if (applicationIds.length === 0) return { itemsProcessed: 0, itemsFailed: 0 };

    let sent = 0;
    let failed = 0;
    for (const applicationId of applicationIds) {
      const application = await applicationDAO.getById(applicationId);

      if (!application || application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
        const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST, applicationId, sessionEnv.DB);
        await run.skip('Application not connected');
        continue;
      }
      if (!ScheduledDigestTask.supportsDigestEmail(application.providerId, application.connectionMethod)) {
        const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST, applicationId, sessionEnv.DB);
        await run.skip(`Provider does not support digest: ${application.providerId}`);
        continue;
      }

      const configSvc = scope.get<DigestConfigService>(Tokens.DigestConfigService);
      const timeZone = application.timeZone || 'UTC';
      const isDue = await configSvc.isDueToSend(applicationId, timeZone);
      if (!isDue) {
        continue;
      }

      const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST, applicationId, sessionEnv.DB);
      try {
        const accessToken = await scope.get<OAuth2AccessTokenService>(Tokens.OAuth2AccessTokenService).getAccessToken(applicationId);
        const keys = await scope.get(Tokens.Keys)();
        const digestSvc = new DigestService(sessionEnv, keys.masterKey, keys.actionKey, { providerRegistry: scope.get<InjectableEmailProviderRegistry>(Tokens.ProviderRegistry) });
        await digestSvc.sendDigest(application, accessToken);
        sent++;
        await run.succeed({ itemsProcessed: 1, itemsFailed: 0, summary: 'Digest sent' });
      } catch (error: unknown) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ScheduledDigestTask] Failed to send digest for application ${applicationId}:`, error);
        await run.fail(message);
      }
    }
    console.log(`[ScheduledDigestTask] Sent ${sent} digests`);
    return {
      itemsProcessed: sent,
      itemsFailed: failed,
      summary: `Sent ${sent} of ${applicationIds.length} digests`,
    };
  }
}

interface ScheduledDigestTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { ScheduledDigestTask };
