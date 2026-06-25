import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { EmailProviderRegistry } from '@mail-otter/backend-services/provider';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import { BACKGROUND_TASK_TYPE_IMAP_POLLING, CONNECTION_METHOD_IMAP_PASSWORD } from '@mail-otter/shared/constants';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import type { AnyProviderCredentials, ProviderMessageSummary } from '@mail-otter/backend-services/provider';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

class ImapPollingTask extends IScheduledTask<ImapPollingTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ImapPollingTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const sessionEnv = createD1SessionEnv(env);
    const subscriptionDAO = new ProviderSubscriptionDAO(sessionEnv.DB);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);
    const subscriptions: ProviderSubscription[] = await subscriptionDAO.listActiveImapSubscriptions();

    const baseUrl = env.CALLBACK_BASE_URL ?? '';
    let polled = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      const run = await this.createApplicationRun(BACKGROUND_TASK_TYPE_IMAP_POLLING, subscription.applicationId, sessionEnv.DB);
      try {
        await ImapPollingTask.pollSubscription(subscription, applicationDAO, subscriptionDAO, env, baseUrl);
        polled++;
        await run.succeed({ itemsProcessed: 1, itemsFailed: 0, summary: 'IMAP mailbox polled' });
      } catch (error: unknown) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ImapPollingTask] Failed to poll subscription ${subscription.subscriptionId}: ${message}`);
        await run.fail(message);
      }
    }
    return {
      itemsProcessed: polled,
      itemsFailed: failed,
      summary: `Polled ${polled} of ${subscriptions.length} IMAP subscriptions`,
    };
  }

  private static async pollSubscription(
    subscription: ProviderSubscription,
    applicationDAO: ConnectedApplicationDAO,
    subscriptionDAO: ProviderSubscriptionDAO,
    env: ImapPollingTaskEnv,
    baseUrl: string,
  ): Promise<void> {
    const application: ConnectedApplication | undefined = await applicationDAO.getById(subscription.applicationId);
    if (!application) return;

    const credentials = await this.resolveCredentials(application, env);
    const provider = EmailProviderRegistry.get(application.providerId, application.connectionMethod);
    const { messages, newCursor } = await provider.pollNewMessages(credentials, subscription.imapCursor ?? null);

    if (messages.length > 0) {
      await this.enqueueMessages(messages, subscription, baseUrl, env);
      await subscriptionDAO.updateImapCursor(subscription.subscriptionId, newCursor, Math.floor(Date.now() / 1000));
    }
  }

  private static async resolveCredentials(application: ConnectedApplication, env: ImapPollingTaskEnv): Promise<AnyProviderCredentials> {
    if (application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD) {
      if (!application.imapUsername || !application.imapPassword) {
        throw new Error('IMAP credentials are incomplete for application ' + application.applicationId);
      }
      return {
        type: 'imap-password',
        username: application.imapUsername,
        password: application.imapPassword,
        host: application.imapHost ?? '',
        port: application.imapPort ?? 993,
      };
    }
    const accessToken = await new OAuth2AccessTokenService(env).getAccessToken(application.applicationId);
    return {
      type: 'oauth2',
      accessToken,
      imapUsername: application.providerEmail ?? undefined,
    };
  }

  private static async enqueueMessages(
    messages: ProviderMessageSummary[],
    subscription: ProviderSubscription,
    baseUrl: string,
    env: ImapPollingTaskEnv,
  ): Promise<void> {
    const uids = messages.map((m) => m.uid);
    const newCursor = String(Math.max(...uids));
    await env.EMAIL_EVENTS_QUEUE.send({
      type: 'imap-notification',
      applicationId: subscription.applicationId,
      messageUids: uids,
      newCursor,
      callbackBaseUrl: baseUrl,
    });
  }
}

interface ImapPollingTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  EMAIL_EVENTS_QUEUE: Queue;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  CALLBACK_BASE_URL?: string;
}

export { ImapPollingTask };
