import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { DigestConfigService, DigestService } from '@mail-otter/backend-services/digest';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import {
  BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST,
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  DIGEST_CONFIG_KEY_ENABLED,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class ScheduledDigestTask extends IScheduledTask<ScheduledDigestTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ScheduledDigestTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const actionKey: string = await env.ACTION_ENCRYPTION_KEY_SECRET.get();
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
      if (application.providerId !== PROVIDER_GOOGLE_GMAIL && application.providerId !== PROVIDER_MICROSOFT_OUTLOOK) {
        const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST, applicationId, sessionEnv.DB);
        await run.skip('Provider does not support digest');
        continue;
      }

      const configSvc = new DigestConfigService(applicationDAO);
      const timeZone = application.timeZone || 'UTC';
      const isDue = await configSvc.isDueToSend(applicationId, timeZone);
      if (!isDue) {
        continue;
      }

      const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_SCHEDULED_DIGEST, applicationId, sessionEnv.DB);
      try {
        const accessToken = await new OAuth2AccessTokenService(env).getAccessToken(applicationId);
        const digestSvc = new DigestService(sessionEnv, masterKey, actionKey);
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
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { ScheduledDigestTask };
